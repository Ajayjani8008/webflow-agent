// url-compile.js — turn a ref-extract capture into a BUILDABLE plan. The missing half of url-intake.
//
// Why this exists (measured 2026-08-07): Figma sources get figma-parse -> figma-compile -> plan.json +
// contract, generated. A URL source had nothing, so the agent hand-authored a 20-string plan from a
// 586-node extract that already contained all 139 strings, the 4-column group structure, the card blades
// and the exact class taxonomy. That hand-authoring cost 204 tool calls, 5 publishes and a build that
// matched its reference at 1.4%. The extract was never the problem; nothing read it.
//
// Usage:
//   node url-compile.js <extract.json> --prefix=<block> [--font=Inter] [--out-plan=p.json]
//        [--out-contract=c.json] [--max-depth=N] [--json]
//   node url-compile.js --self-test
//
// Output:
//   plan.json      — { section, classes[], tree } ready for wf-preflight.js (types already trap-safe:
//                    text never lands on TextBlock, links with children become LinkBlock, etc.)
//   contract.json  — dom-contract expectations per generated class, from the reference's own computed values
//   stdout         — EVIDENCE block: nodes in, nodes planned, classes, strings, and every skip with a reason
//
// Design rules baked in (each one is a defect this pack already paid for):
//   · text-bearing nodes -> Paragraph / Heading / TextLink / LinkBlock / Button. NEVER TextBlock.
//   · <a> with element children -> LinkBlock; text-only <a> -> TextLink.
//   · class names come from the reference's own BEM suffix, re-prefixed with the SITE's block, so 586
//     nodes collapse to a few dozen shared classes instead of per-node styles.
//   · shorthands expanded to longhand (gap, border-radius, padding, margin, border).
//   · layout RESULTS are not authored values: fractional width/height on text nodes are dropped, kept only
//     for intrinsic media (img/svg/icon).
//   · a proprietary font family is substituted once, explicitly, and reported — never silently inherited.
const fs = require('fs'); const path = require('path'); const os = require('os');
const argv = process.argv.slice(2);
const opt = n => { const p = '--' + n + '='; const a = argv.find(x => x.startsWith(p)); return a ? a.slice(p.length) : null; };
const has = n => argv.includes('--' + n);
const die = m => { console.error(m); process.exit(2) };

const TEXT_TAGS = new Set(['span', 'p', 'strong', 'em', 'b', 'i', 'small', 'label', 'li', 'div']);
const HEADING = /^h([1-6])$/;
const TAG_AS = { header: 'header', nav: 'nav', footer: 'footer', main: 'main', section: 'section', article: 'article', aside: 'aside' };
// properties worth authoring on a class. Everything else in a computed dump is noise or a layout result.
const KEEP = new Set(['display', 'flex-direction', 'flex-wrap', 'align-items', 'justify-content', 'align-self',
  'flex-grow', 'flex-shrink', 'grid-template-columns', 'grid-template-rows', 'grid-auto-flow',
  'column-gap', 'row-gap', 'gap', 'position', 'top', 'right', 'bottom', 'left', 'z-index',
  'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
  'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
  'font-family', 'font-size', 'font-weight', 'line-height', 'letter-spacing', 'text-transform',
  'text-align', 'text-decoration', 'color', 'background-color', 'background-image', 'opacity',
  'border-radius', 'border-top-left-radius', 'border-top-right-radius', 'border-bottom-left-radius',
  'border-bottom-right-radius', 'border-top-width', 'border-top-style', 'border-top-color',
  'border-bottom-width', 'border-bottom-style', 'border-bottom-color', 'box-shadow', 'transition',
  'overflow', 'max-width', 'width', 'height', 'min-height', 'flex-basis', 'text-overflow', 'white-space']);
const SHORTHAND = {
  'gap': ['grid-row-gap', 'grid-column-gap'],
  'row-gap': ['grid-row-gap'], 'column-gap': ['grid-column-gap'],
  'border-radius': ['border-top-left-radius', 'border-top-right-radius', 'border-bottom-left-radius', 'border-bottom-right-radius'],
};
// intrinsic sizes are authored; a text node's measured width is not
const INTRINSIC_TAGS = new Set(['img', 'svg', 'video', 'canvas']);

const kebab = s => String(s).replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase();

// `transition` is a shorthand too, and data_style_tool voids shorthands into the Custom Properties panel.
// Splitting is paren-aware so cubic-bezier(0.165, 0.84, 0.44, 1) survives intact.
function splitTopLevel(v) {
  const out = []; let depth = 0, cur = '';
  for (const ch of String(v)) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) { out.push(cur.trim()); cur = ''; continue }
    cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}
function expandTransition(v) {
  const props = [], durs = [], eases = [], delays = [];
  for (const part of splitTopLevel(v)) {
    const times = part.match(/(-?[\d.]+m?s)/g) || [];
    const ease = (part.match(/cubic-bezier\([^)]*\)|steps\([^)]*\)|linear|ease-in-out|ease-in|ease-out|ease/) || [])[0] || 'ease';
    let prop = part.split(/\s+/)[0];
    if (/^[\d.]/.test(prop) || /^(cubic-bezier|steps|linear|ease)/.test(prop)) prop = 'all';
    props.push(prop);
    durs.push(times[0] || '0s');
    eases.push(ease);
    delays.push(times[1] || '0s');
  }
  const o = {
    'transition-property': props.join(', '),
    'transition-duration': durs.join(', '),
    'transition-timing-function': eases.join(', '),
  };
  if (delays.some(d => d !== '0s')) o['transition-delay'] = delays.join(', ');
  return o;
}

function compile() {
  const src = argv.find(a => !a.startsWith('--')) || die('usage: node url-compile.js <extract.json> --prefix=<block>');
  const prefix = opt('prefix') || die('--prefix=<block> is required (derive it from the SITE id, never the source)');
  const font = opt('font');
  const maxDepth = Number(opt('max-depth') || 99);
  const d = JSON.parse(fs.readFileSync(src, 'utf8'));
  const nodes = d.nodes || d.elements || [];
  if (!nodes.length) die('extract contains no nodes: ' + src);

  const skips = [];
  const byPath = new Map();
  const childrenOf = new Map();
  // ---- pass 1: decide which nodes are buildable, and name their class
  const parentPath = p => { const i = p.lastIndexOf('>'); return i < 0 ? null : p.slice(0, i) };
  for (const n of nodes) if (n.path) byPath.set(n.path, n);
  for (const n of nodes) {
    if (!n.path) continue;
    const pp0 = parentPath(n.path);
    if (!childrenOf.has(pp0)) childrenOf.set(pp0, []);
    childrenOf.get(pp0).push(n);
  }
  const classOf = new Map();          // reference class signature -> generated class name
  const classProps = new Map();       // generated class -> properties object
  const usedNames = new Set();

  const refSig = n => {
    const cls = String(n.class || '');
    const bem = cls.split(/\s+/).find(c => c.includes('__'));
    if (bem) return bem.replace(/^[^_]*__/, '');           // products-menu-link-item-title
    const own = cls.split(/\s+/).filter(Boolean)[0];
    return own ? kebab(own) : null;
  };

  const renames = []; const moduleNeeded = [];
  const MODULE_WORDS = /(carousel|slider|marquee|tabs|accordion|lightbox|dropdown)/i;
  const nameFor = n => {
    let sig = refSig(n);
    if (sig && MODULE_WORDS.test(sig)) {
      // does it actually behave like that module here? a carousel needs >=2 sibling slides of equal size
      const kids = (childrenOf.get(n.path) || []);
      const sizes = kids.map(k => `${Math.round((k.box || {}).w || 0)}x${Math.round((k.box || {}).h || 0)}`);
      const repeated = sizes.length >= 2 && new Set(sizes).size < sizes.length;
      if (!repeated) {
        const was = sig;
        sig = sig.replace(MODULE_WORDS, 'cards');
        renames.push(`${was} -> ${sig} (renders statically here: ${kids.length} child(ren), no repeated slide box — a div named after a module would fail the native-module gate)`);
      } else {
        moduleNeeded.push(`${sig} at ${n.path} — build the NATIVE module, not a div`);
      }
    }
    const base = sig ? `${prefix}__${kebab(sig)}` : `${prefix}__${kebab(n.tag)}`;
    if (classOf.has(sig || n.tag)) return classOf.get(sig || n.tag);
    let name = base, i = 2;
    while (usedNames.has(name) && !classOf.has(sig || n.tag)) { name = `${base}-${i++}` }
    usedNames.add(name); classOf.set(sig || n.tag, name);
    return name;
  };

  const propsFor = (n, cls) => {
    if (classProps.has(cls)) return;                       // first node with this class authors it
    const s = n.styles || {}; const out = {};
    for (const [k, v] of Object.entries(s)) {
      if (!KEEP.has(k)) continue;
      if (v === undefined || v === null || v === '' || v === 'auto' && !['top', 'right', 'bottom', 'left'].includes(k)) continue;
      if (k === 'font-family' && font) { out[k] = font; continue }
      if (['width', 'height', 'min-height', 'flex-basis', 'max-width'].includes(k)) {
        const frac = /^\d+\.\d+px$/.test(String(v));
        // "logo-link" is a 208px wrapper, not an icon: a name hint only counts when the box is icon-sized.
        const b = n.box || {};
        const iconSized = b.w > 0 && b.w <= 64 && b.h > 0 && b.h <= 64;
        const intrinsic = INTRINSIC_TAGS.has(n.tag) || (iconSized && /icon|logo|avatar|badge|mark|chevron|arrow/i.test(String(n.class || '')));
        if (frac && !intrinsic) { continue }               // measured result, not an authored value
      }
      if (k === 'transition') { Object.assign(out, expandTransition(v)); continue }
      if (SHORTHAND[k]) { for (const long of SHORTHAND[k]) out[long] = v; continue }
      out[k] = v;
    }
    // Fluid base (Rule 7): a captured px width is the reference VIEWPORT, not responsive intent.
    // Containers get width:100% + max-width; bare px stays only on intrinsic media.
    if (out.width && /^\d+(\.\d+)?px$/.test(String(out.width)) && !INTRINSIC_TAGS.has(n.tag)) {
      const px = String(out.width);
      out.width = '100%';
      if (!out['max-width'] || out['max-width'] === 'none') out['max-width'] = px;
    }
    // Rule 15: an icon/image must never be allowed to collapse in a flex row, and it needs an explicit box.
    if (INTRINSIC_TAGS.has(n.tag)) {
      out['flex-shrink'] = '0';
      const b = n.box || {};
      if (!out.width && b.w) out.width = Math.round(b.w) + 'px';
      if (!out.height && b.h) out.height = Math.round(b.h) + 'px';
    }
    classProps.set(cls, out);
  };

  const typeFor = (n, hasElementChildren) => {
    const t = String(n.tag || '').toLowerCase();
    const hm = t.match(HEADING);
    if (hm) return { type: 'Heading', setHeadingLevel: Number(hm[1]) };
    if (t === 'img' || t === 'svg') return { type: 'Image' };
    if (t === 'button') return n.text ? { type: 'Button' } : { type: 'LinkBlock' };
    if (t === 'a') return hasElementChildren ? { type: 'LinkBlock' } : { type: 'TextLink' };
    if (n.text && !hasElementChildren) return { type: 'Paragraph' };   // never TextBlock: it cannot take text
    if (TAG_AS[t]) return { type: 'DivBlock', setTag: TAG_AS[t] };
    return { type: 'DivBlock' };
  };

  // childrenOf and byPath are built once, above pass 1 (nameFor needs them). Populating them twice
  // duplicated every child and exploded the tree to 1.4M nodes — caught by the node count in EVIDENCE.

  const buildable = n => {
    const b = n.box || {};
    if ((n.depth || 0) > maxDepth) { skips.push(`${n.path} — deeper than --max-depth=${maxDepth}`); return false }
    if (b.x !== undefined && b.x < -500) { skips.push(`${n.path} — offscreen (x=${b.x}), visually-hidden helper`); return false }
    if (!n.text && (b.w === 0 && b.h === 0) && !INTRINSIC_TAGS.has(n.tag)) { skips.push(`${n.path} — zero box, no text`); return false }
    return true;
  };

  let planned = 0; const strings = [];
  const toSchema = n => {
    const kids = (childrenOf.get(n.path) || []).filter(buildable);
    const hasKids = kids.length > 0;
    const t = typeFor(n, hasKids);
    const cls = nameFor(n);
    propsFor(n, cls);
    planned++;
    const schema = { type: t.type, styleNames: [cls] };
    if (t.setTag) schema.setTag = t.setTag;
    if (t.setHeadingLevel) schema.setHeadingLevel = t.setHeadingLevel;
    if (n.text && !hasKids) { schema.setText = n.text; strings.push(n.text) }
    if (n.href) schema.setLink = { linkType: /^https?:/.test(n.href) ? 'url' : 'url', link: n.href };
    if (n.tag === 'img' || n.tag === 'svg') schema.needsAsset = { hint: n.class || n.tag, svgInline: !!n.svg };
    if (hasKids) schema.children = kids.map(toSchema);
    return schema;
  };

  const roots = nodes.filter(n => n.path && !byPath.has(parentPath(n.path) || '')).filter(buildable);
  const rootNode = roots[0] || nodes[0];
  const tree = toSchema(rootNode);

  const section = kebab(opt('section') || prefix);
  const classes = [...classProps.entries()].map(([name, properties]) => ({ name, properties }));
  const plan = { section, source: d.url || src, mode: 'replica', classes, tree };
  const contract = {
    section, width: (d.viewport && d.viewport.width) || 1440,
    elements: classes.filter(c => Object.keys(c.properties).length).map(c => ({
      sel: '.' + c.name,
      expect: Object.fromEntries(Object.entries(c.properties).filter(([k]) =>
        ['font-size', 'font-weight', 'line-height', 'color', 'background-color', 'display',
          'padding-left', 'padding-right', 'height', 'text-transform'].includes(k))),
    })).filter(e => Object.keys(e.expect).length),
  };

  const planOut = opt('out-plan') || src.replace(/\.json$/, '.plan.json');
  const conOut = opt('out-contract') || src.replace(/\.json$/, '.contract.json');
  fs.writeFileSync(planOut, JSON.stringify(plan, null, 1));
  fs.writeFileSync(conOut, JSON.stringify(contract, null, 1));

  const needsAsset = JSON.stringify(plan).split('"needsAsset"').length - 1;
  if (has('json')) { console.log(JSON.stringify({ planned, classes: classes.length, strings: strings.length, skips, planOut, conOut }, null, 1)); return }
  console.log(`EVIDENCE url-compile — OK   ${section}`);
  console.log(`  nodes in extract   ${nodes.length}`);
  console.log(`  nodes planned      ${planned}   (skipped ${skips.length})`);
  console.log(`  shared classes     ${classes.length}   <- ${nodes.length} nodes collapse to this many authored classes`);
  console.log(`  strings carried    ${strings.length}   <- replica coverage target; content-coverage.js enforces it`);
  console.log(`  media needing an asset  ${needsAsset}   (upload + bind by id; inline svg -> pre-flight per Rule 15)`);
  if (font) console.log(`  font substituted   every family -> ${font} (reference family is proprietary; deliberate, recorded)`);
  console.log(`  plan     ${planOut}`);
  console.log(`  contract ${conOut}`);
  if (renames.length) { console.log(`  truthful renames (${renames.length}):`); renames.slice(0,4).forEach(r => console.log(`    · ${r}`)) }
  if (moduleNeeded.length) { console.log(`  NATIVE MODULE REQUIRED (${moduleNeeded.length}) — do not build these as divs:`); moduleNeeded.slice(0,4).forEach(r => console.log(`    · ${r}`)) }
  if (skips.length) { console.log(`  skips (first 8):`); skips.slice(0, 8).forEach(s => console.log(`    · ${s}`)) }
  console.log(`  NEXT: node wf-preflight.js ${planOut} --site-prefix=<site id> --known-prefixes=<registry>`);
}

function selfTest() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'uc-selftest-'));
  const ex = path.join(tmp, 'ex.json');
  fs.writeFileSync(ex, JSON.stringify({
    url: 'https://example.com/', viewport: { width: 1440 },
    nodes: [
      { tag: 'header', depth: 0, path: 'header', class: 'global-navigation', box: { x: 0, y: 0, w: 1440, h: 80 }, styles: { display: 'flex', height: '80px', 'padding-left': '40px', gap: '32px', 'font-family': 'Clarkson, Helvetica', transition: 'background-color 0.5s cubic-bezier(0.165, 0.84, 0.44, 1), top 0.3s ease' } },
      { tag: 'a', depth: 1, path: 'header>a', class: 'global-navigation__logo-link', href: '/', box: { x: 40, y: 25, w: 208, h: 30 }, styles: { display: 'block', width: '208.4px' } },
      { tag: 'span', depth: 2, path: 'header>a>span', class: 'global-navigation__logo-text', text: 'SQUARESPACE', box: { x: 40, y: 25, w: 200, h: 30 }, styles: { 'font-size': '20px', color: 'rgb(255,255,255)' } },
      { tag: 'a', depth: 1, path: 'header>a[2]', class: 'global-navigation__skip-link', href: '#content', box: { x: -1000, y: 40, w: 48, h: 48 }, styles: {} },
      { tag: 'div', depth: 1, path: 'header>div[3]', class: 'global-navigation__menu', box: { x: 400, y: 0, w: 600, h: 80 }, styles: { display: 'grid', 'border-radius': '10px' } },
      { tag: 'span', depth: 2, path: 'header>div[3]>span', class: 'global-navigation__eyebrow', text: 'Website', box: { x: 410, y: 10, w: 60, h: 14 }, styles: { 'font-size': '11px', width: '59.44px' } },
      { tag: 'h2', depth: 2, path: 'header>div[3]>h2', class: 'global-navigation__blade-title', text: 'Squarespace Premium', box: { x: 410, y: 30, w: 200, h: 20 }, styles: { 'font-size': '15px' } },
      { tag: 'img', depth: 2, path: 'header>div[3]>img', class: 'global-navigation__blade-img', box: { x: 700, y: 10, w: 24, h: 24 }, styles: { width: '24px', height: '24px' } },
    ],
  }));
  const run = a => { const r = require('child_process').spawnSync(process.execPath, [__filename, ...a], { encoding: 'utf8' }); return { code: r.status, out: (r.stdout || '') + (r.stderr || '') } };
  const planOut = path.join(tmp, 'p.json');
  const r = run([ex, '--prefix=nhp-header', '--font=Inter', '--out-plan=' + planOut, '--out-contract=' + path.join(tmp, 'c.json')]);
  const plan = JSON.parse(fs.readFileSync(planOut, 'utf8'));
  const flat = JSON.stringify(plan);
  const cls = plan.classes.map(c => c.name);
  const findType = t => flat.includes(`"type":"${t}"`);
  const cases = [
    ['exits 0', r.code, 0],
    ['no TextBlock anywhere (it cannot take text)', flat.includes('"TextBlock"'), false],
    ['text span -> Paragraph', findType('Paragraph'), true],
    ['h2 -> Heading with level', flat.includes('"setHeadingLevel":2'), true],
    ['a with child -> LinkBlock', findType('LinkBlock'), true],
    ['header keeps its semantic tag', flat.includes('"setTag":"header"'), true],
    ['gap expanded to longhand', flat.includes('grid-column-gap'), true],
    ['border-radius expanded to 4 corners', (flat.match(/border-(top|bottom)-(left|right)-radius/g) || []).length >= 4, true],
    ['offscreen skip-link dropped', flat.includes('#content'), false],
    ['class names re-prefixed from the reference BEM', cls.includes('nhp-header__logo-text'), true],
    ['proprietary font substituted', flat.includes('Clarkson'), false],
    ['fractional text width dropped', flat.includes('208.4px') || flat.includes('59.44px'), false],
    ['intrinsic img size kept', flat.includes('"width":"24px"'), true],
    ['image flagged as needing an asset', flat.includes('needsAsset'), true],
    ['container px width becomes fluid 100% + max-width', flat.includes('"width":"100%"') && flat.includes('"max-width"'), true],
    ['transition shorthand expanded (preflight blocks it otherwise)', flat.includes('transition-timing-function'), true],
    ['cubic-bezier survived paren-aware splitting', flat.includes('cubic-bezier(0.165, 0.84, 0.44, 1)'), true],
    ['every reference string carried', ['SQUARESPACE', 'Website', 'Squarespace Premium'].every(s => flat.includes(s)), true],
  ];
  let ok = true;
  for (const [name, got, want] of cases) { const pass = got === want; ok = ok && pass; console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}` + (pass ? '' : `  (got ${JSON.stringify(got)}, want ${JSON.stringify(want)})`)) }
  try { fs.rmSync(tmp, { recursive: true, force: true }) } catch (e) {}
  process.exit(ok ? 0 : 1);
}

if (has('self-test')) selfTest(); else compile();
