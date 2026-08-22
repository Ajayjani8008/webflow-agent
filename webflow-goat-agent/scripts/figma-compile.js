// figma-compile.js — parsed Figma facts -> a build PLAN, a property CONTRACT and an asset list.
//
// This is the step that was missing entirely. Before it, values went Figma -> a human reading ->
// hand-typed MCP calls -> a hand-typed contract, and that path produced every accuracy defect worth
// naming (a 66px mis-centred block from reinterpreting absolute children as a flex column, a
// letter-spacing typed from JSON that contradicted the render, combo classes applied but never
// declared as combos). Generating all three artefacts from ONE parsed source makes them consistent
// by construction, and makes the contract free instead of a hand-written chore that does not scale.
//
// Usage:
//   node figma-compile.js <parsed.json> --prefix=example-hero [--root=1:4888] [--section-tag]
//        [--out-plan=plan.json] [--out-contract=contract.json] [--json]
//   node figma-compile.js --self-test
//
// Emits:
//   plan.json      { section, classes[{name,parentStyleNames?,properties}], tree }  -> feed to wf-preflight.js
//   contract.json  { section, root, elements[{sel,count,expect}] }                  -> feed to dom-contract.js
//
// DESIGN RULES IT ENFORCES (each one exists because it was violated by hand at least once):
//  · POSITIONING MODEL IS PRESERVED. If Figma says a child is absolute at left/top, it stays absolute.
//    Never "improve" it into a flex column — that is what moved a brand block 66px.
//  · LONGHAND ONLY. The parser already expanded shorthands; nothing re-collapses them.
//  · MODIFIERS ARE DECLARED AS COMBOS. Any class emitted as base+modifier carries parentStyleNames,
//    because both element_builder and set_style reject an undeclared pair.
//  · IDENTICAL PROPERTY SETS COLLAPSE into one shared class — real reuse, fewer classes, less payload.
//  · CONTRACTS ONLY ASSERT WHAT A BROWSER REPORTS STABLY. Figma's fill idioms (width:min-content,
//    min-width:100%) are emitted into the plan but NOT asserted, and they are reported as decisions
//    the agent must make, not silently dropped.
const fs = require('fs'); const path = require('path');
const argv = process.argv.slice(2);
const flag = (n, d) => { const f = argv.find(x => x === `--${n}` || x.startsWith(`--${n}=`)); return f === undefined ? d : (f.includes('=') ? f.split('=').slice(1).join('=') : true) };
const SELFTEST = argv.includes('--self-test');
const JSONOUT = argv.includes('--json');

// Values a browser will not report back the way Figma phrased them — plan them, do not assert them.
const NON_ASSERTABLE = new Set(['width', 'height', 'min-width', 'max-width', 'align-content', 'word-break', 'flex-grow']);
const ASSERT_ALWAYS = new Set(['font-family', 'font-size', 'font-weight', 'line-height', 'letter-spacing',
  'color', 'background-color', 'text-transform', 'text-align', 'white-space', 'display', 'position',
  'flex-direction', 'align-items', 'justify-content', 'grid-row-gap', 'grid-column-gap',
  'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
  'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
  'border-top-left-radius', 'border-top-right-radius', 'border-bottom-left-radius', 'border-bottom-right-radius',
  'opacity', 'overflow', 'flex-shrink', 'z-index', 'top', 'right', 'bottom', 'left', 'mix-blend-mode']);

const slug = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 34);

// Figma layer name -> the native module it should be built with. Div-imitating an available module is
// a ban-sweep failure, so this HINTS loudly rather than quietly emitting a DivBlock.
const MODULE_HINTS = [
  [/\b(nav|navbar|header menu)\b/i, 'Navbar', 'NOT creatable via MCP — see impossible_cases.md; build a container + real Dropdowns and log the gap'],
  [/\b(slider|carousel|swiper)\b/i, 'Slider', 'use the native Slider (2 slides by default — append the rest)'],
  [/\b(tab|tabs)\b/i, 'Tabs', 'use the native Tabs (3 tabs by default, labels are placeholders)'],
  [/\b(accordion|dropdown|submenu)\b/i, 'Dropdown', 'use the native Dropdown (ships "Dropdown" + Link 1-3 placeholders)'],
  [/\b(gallery|lightbox|zoom)\b/i, 'Lightbox', 'use the native Lightbox'],
  [/\b(form|subscribe|newsletter|contact)\b/i, 'Form', 'use the native Form (ships Name/Email + success/error copy)'],
  [/\b(video|youtube|embed player)\b/i, 'YouTubeVideo', 'use the native Video/YouTube element'],
  [/\b(quote|testimonial)\b/i, 'Blockquote', 'Blockquote accepts set_text on creation'],
  [/\b(list|bullets)\b/i, 'List', 'use a native List/ListItem'],
];

function elementTypeFor(n, isRoot, sectionTag) {
  if (n.src) return { type: 'Image' };
  if (/^h([1-6])$/.test(n.tag)) return { type: 'Heading', headingLevel: +n.tag[1] };
  if (n.text != null) return { type: 'Paragraph' };          // Paragraph, never TextBlock — set_text is ignored on TextBlock
  if (isRoot && sectionTag) return { type: 'Section' };
  return { type: 'DivBlock' };
}

function compile(parsed, opts) {
  const prefix = opts.prefix;
  if (!prefix) throw new Error('--prefix is required (e.g. --prefix=example-hero)');
  const nodes = parsed.nodes.filter(n => n.nodeId || Object.keys(n.css).length || n.text || n.src);
  const rootId = opts.root || (nodes.find(n => n.nodeId) || {}).nodeId;
  const decisions = [], assets = [];

  // ---- name every node, then collapse identical property sets into shared classes ----
  const sigToClass = new Map();
  const classes = [];
  const nameCount = new Map();
  const assign = (n, isRoot) => {
    const props = { ...n.css };
    for (const k of Object.keys(props)) {
      if (NON_ASSERTABLE.has(k) && /min-content|max-content|fit-content/.test(String(props[k]))) {
        decisions.push({ nodeId: n.nodeId, prop: k, value: props[k],
          decide: `Figma fill idiom "${k}:${props[k]}" — pick width:100% + max-width:<n>px (fluid, rule FLUID BASE FIRST) or a bare px only if this is intrinsic UI (icon/avatar/logo)` });
      }
    }
    const sig = JSON.stringify(Object.keys(props).sort().map(k => [k, props[k]]));
    let cls = sigToClass.get(sig);
    if (!cls || isRoot) {
      const base = isRoot ? prefix : `${prefix}__${slug(n.name) || slug(n.tag) + '-' + (nameCount.get(n.tag) || 0)}`;
      nameCount.set(n.tag, (nameCount.get(n.tag) || 0) + 1);
      let name = base, i = 2;
      while (classes.some(c => c.name === name)) name = `${base}-${i++}`;
      cls = { name, properties: props, _nodes: [] };
      classes.push(cls);
      if (!isRoot) sigToClass.set(sig, cls);
    }
    cls._nodes.push(n.nodeId || n.name || n.tag);
    return cls;
  };

  // ---- build the tree, preserving Figma's positioning model ----
  const byDepth = [];
  const build = (n, isRoot) => {
    const cls = assign(n, isRoot);
    const et = elementTypeFor(n, isRoot, opts.sectionTag);
    const node = { type: et.type, styleNames: [cls.name] };
    if (et.headingLevel) node.headingLevel = et.headingLevel;
    if (n.text != null) node.setText = n.text;
    if (n.src) { node.asset = n.src; assets.push({ nodeId: n.nodeId, name: n.name, url: n.src }) }
    if (n.css.position === 'absolute') node._positioning = 'absolute-from-figma (do NOT convert to flex)';
    for (const [re, mod, note] of MODULE_HINTS) {
      if (n.name && re.test(n.name)) { node.moduleHint = { module: mod, note }; decisions.push({ nodeId: n.nodeId, decide: `layer "${n.name}" looks like a ${mod}: ${note}` }); break }
    }
    for (const f of n.flags || []) decisions.push({ nodeId: n.nodeId, decide: f });
    return node;
  };

  // nest by the parser's depth/parent chain
  const stack = [];
  let tree = null;
  for (const n of nodes) {
    const node = build(n, tree === null);
    node.children = [];
    while (stack.length && stack[stack.length - 1].depth >= n.depth) stack.pop();
    if (!stack.length) { if (!tree) tree = node; else (tree.children = tree.children || []).push(node) }
    else stack[stack.length - 1].node.children.push(node);
    stack.push({ depth: n.depth, node });
  }
  const prune = nd => { if (nd.children && !nd.children.length) delete nd.children; else if (nd.children) nd.children.forEach(prune); return nd };
  if (tree) prune(tree);

  // ---- contract: assert only what a browser reports stably ----
  const elements = [];
  for (const c of classes) {
    const expect = {};
    for (const [k, v] of Object.entries(c.properties)) {
      if (!ASSERT_ALWAYS.has(k)) continue;
      expect[k] = v;
    }
    if (!Object.keys(expect).length) continue;
    const count = c._nodes.length;
    elements.push(count > 1 ? { sel: '.' + c.name, count, expect } : { sel: '.' + c.name, expect });
  }

  return {
    plan: { section: prefix, root: rootId, classes: classes.map(({ name, properties }) => ({ name, properties })), tree },
    contract: { section: prefix, source: `generated by figma-compile.js from ${opts.srcName || 'parsed design context'} — values are Figma's, not the built page's`, root: '.' + prefix, elements },
    assets, decisions
  };
}

if (SELFTEST) {
  const parsed = { nodes: [
    { nodeId: '1:1', name: 'Hero', tag: 'div', depth: 0, text: null, src: null, css: { display: 'flex', 'flex-direction': 'column', 'grid-row-gap': '35px', 'grid-column-gap': '35px', position: 'relative' }, flags: [] },
    { nodeId: '1:2', name: 'Title', tag: 'p', depth: 1, text: 'Hello.', src: null, css: { 'font-family': 'Yrsa', 'font-weight': '600', 'font-size': '70px', width: 'min-content' }, flags: [] },
    { nodeId: '1:3', name: 'Dot', tag: 'div', depth: 1, text: null, src: null, css: { width: '11px', height: '11px', 'background-color': '#F6E7BE' }, flags: [] },
    { nodeId: '1:4', name: 'Dot', tag: 'div', depth: 1, text: null, src: null, css: { width: '11px', height: '11px', 'background-color': '#F6E7BE' }, flags: [] },
    { nodeId: '1:5', name: 'Shop Slider', tag: 'div', depth: 1, text: null, src: null, css: { position: 'absolute', left: '10px' }, flags: ['rotation -90deg — bake it'] }
  ] };
  const r = compile(parsed, { prefix: 'example-hero', sectionTag: true, srcName: 'self-test' });
  const fails = [];
  const has = (cond, what) => { if (!cond) fails.push(what) };
  has(r.plan.tree.type === 'Section', 'root becomes Section');
  has(r.plan.tree.children[0].type === 'Paragraph', 'text node becomes Paragraph (never TextBlock)');
  has(r.plan.tree.children[0].setText === 'Hello.', 'text carried into setText');
  has(r.plan.classes.length === 4, `identical Dot property sets collapse to ONE class (got ${r.plan.classes.length} classes)`);
  const dot = r.contract.elements.find(e => /dot/.test(e.sel));
  has(dot && dot.count === 2, 'shared class asserts count 2');
  has(!('width' in (r.contract.elements.find(e => e.sel === '.example-hero__title') || { expect: {} }).expect), 'min-content width NOT asserted');
  has(r.decisions.some(d => /fill idiom/.test(d.decide)), 'fill idiom surfaced as a decision');
  has(r.decisions.some(d => /Slider/.test(d.decide)), 'module hint surfaced for a slider-named layer');
  has(r.decisions.some(d => /bake/i.test(d.decide)), 'parser flag carried into decisions');
  has(r.plan.tree.children.find(c => c._positioning), 'absolute positioning preserved + annotated');
  const titleExpect = r.contract.elements.find(e => e.sel === '.example-hero__title').expect;
  has(titleExpect['font-weight'] === '600' && titleExpect['font-size'] === '70px', 'typography asserted');
  console.log(fails.length ? 'SELF-TEST FAIL\n  ' + fails.join('\n  ') : `self-test ok — ${r.plan.classes.length} classes, ${r.contract.elements.length} contract selector(s), ${r.decisions.length} decision(s)`);
  process.exit(fails.length ? 1 : 0);
}

const file = argv.filter(a => !a.startsWith('--'))[0];
if (!file || !fs.existsSync(file)) { console.error('usage: node figma-compile.js <parsed.json> --prefix=<block> [--root=] [--section-tag] [--out-plan=] [--out-contract=]   |   --self-test'); process.exit(2) }
const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
let r;
try { r = compile(parsed, { prefix: flag('prefix', ''), root: flag('root', ''), sectionTag: !!flag('section-tag', false), srcName: path.basename(file) }) }
catch (e) { console.error('ERR ' + e.message); process.exit(2) }
const op = flag('out-plan', ''), oc = flag('out-contract', '');
if (op) { fs.mkdirSync(path.dirname(path.resolve(op)), { recursive: true }); fs.writeFileSync(op, JSON.stringify(r.plan, null, 1)) }
if (oc) { fs.mkdirSync(path.dirname(path.resolve(oc)), { recursive: true }); fs.writeFileSync(oc, JSON.stringify(r.contract, null, 1)) }
if (JSONOUT) { console.log(JSON.stringify(r, null, 1)); process.exit(0) }
console.log(`COMPILED ${r.plan.section} — ${r.plan.classes.length} class(es), ${r.contract.elements.length} contract selector(s), ${r.assets.length} asset(s), ${r.decisions.length} decision(s)`);
for (const c of r.plan.classes) console.log(`  .${c.name}  ${Object.keys(c.properties).length} prop(s)`);
if (r.assets.length) { console.log('  assets:'); for (const a of r.assets) console.log(`    ${a.name || a.nodeId}: ${a.url}`) }
if (r.decisions.length) { console.log('  DECISIONS (resolve before building — never guess):'); for (const d of r.decisions) console.log(`    ${d.nodeId || ''} ${d.decide}`) }
if (op) console.log(`  plan     -> ${op}   (run: node wf-preflight.js ${op})`);
if (oc) console.log(`  contract -> ${oc}   (run: node dom-contract.js verify <url> ${oc})`);
