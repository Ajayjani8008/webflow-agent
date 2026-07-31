// figma-parse.js — turn a saved `get_design_context` response into STRUCTURED design facts.
//
// Why this exists (the root cause of nearly every accuracy defect in the 2026-07-31 session):
// the figma cache stored English prose — `"709:2703 div.hero-grad — full-bleed radial gradient layer"` —
// so every value travelled Figma -> a human reading -> a hand-typed tool call. That path produced:
//   · a 66px mis-centred brand block (Figma's absolute children reinterpreted as a flex column)
//   · letter-spacing typed from the JSON while the render said otherwise
//   · combo classes applied that were never declared as combos
//   · a hand-written contract per section, which does not scale past a couple of sections
// `get_design_context` output is already machine-parseable: every element carries `data-node-id`
// and explicit Tailwind arbitrary values with exact px numbers. So parse it once, deterministically,
// and let everything downstream (classes, element tree, contract, asset list) be GENERATED.
//
// Usage:
//   node figma-parse.js <node.dc.jsx> [--json] [--out=<parsed.json>]
//   node figma-parse.js --self-test
//
// Emits { nodes: [ { nodeId, name, tag, text, src, depth, parent, css:{...}, flags:[...] } ], assets, warnings }
// css values are LONGHAND ONLY — Webflow's style tool puts shorthands in the Custom Properties panel
// where they do nothing, so expansion happens here rather than being remembered later.
const fs = require('fs'); const path = require('path');
const argv = process.argv.slice(2);
const JSONOUT = argv.includes('--json');
const SELFTEST = argv.includes('--self-test');
const outFlag = (argv.find(a => a.startsWith('--out=')) || '').split('=')[1];

const FONT_WEIGHT = { thin: 100, extralight: 200, light: 300, regular: 400, normal: 400, medium: 500,
  semibold: 600, bold: 700, extrabold: 800, black: 900 };
const px = v => /^-?\d*\.?\d+$/.test(v) ? v + 'px' : v;

// Tailwind class -> longhand CSS. Arbitrary values in [] carry Figma's exact numbers.
function classToCss(cls, css, flags) {
  const arb = cls.match(/^(.*?)-\[(.+)\]$/);
  const key = arb ? arb[1] : cls;
  let val = arb ? arb[2] : null;
  if (val) val = val.replace(/_/g, ' ');
  const set = (k, v) => { css[k] = v };
  const four = (base, v) => { set(base + '-top', v); set(base + '-right', v); set(base + '-bottom', v); set(base + '-left', v) };
  const radius = v => { set('border-top-left-radius', v); set('border-top-right-radius', v); set('border-bottom-left-radius', v); set('border-bottom-right-radius', v) };

  // bare weight utilities dispatch on the FULL class name, so handle them before the keyed switch
  const bareW = cls.match(/^font-([a-z]+)$/);
  if (bareW && FONT_WEIGHT[bareW[1]]) return set('font-weight', String(FONT_WEIGHT[bareW[1]]));

  switch (key) {
    case 'bg': return set('background-color', val);
    case 'text':
      if (!val) return;
      if (/^#|^rgb/.test(val)) return set('color', val);
      return set('font-size', px(val));
    case 'font': {
      if (!val) {                                  // bare `font-bold`, `font-semibold`, ...
        const w = cls.replace(/^font-/, '').toLowerCase();
        if (FONT_WEIGHT[w]) return set('font-weight', String(FONT_WEIGHT[w]));
        return;
      }
      const m = val.match(/^'?([^':]+)(?::([A-Za-z]+))?'?$/);
      if (m) { set('font-family', m[1]); if (m[2] && FONT_WEIGHT[m[2].toLowerCase()]) set('font-weight', String(FONT_WEIGHT[m[2].toLowerCase()])) }
      return;
    }
    case 'leading': return set('line-height', val === 'normal' ? 'normal' : px(val));
    case 'tracking': return set('letter-spacing', px(val));
    case 'gap': { set('grid-row-gap', px(val)); set('grid-column-gap', px(val)); return }
    case 'gap-x': return set('grid-column-gap', px(val));
    case 'gap-y': return set('grid-row-gap', px(val));
    case 'p': return four('padding', px(val));
    case 'px': { set('padding-left', px(val)); set('padding-right', px(val)); return }
    case 'py': { set('padding-top', px(val)); set('padding-bottom', px(val)); return }
    case 'pt': return set('padding-top', px(val));
    case 'pr': return set('padding-right', px(val));
    case 'pb': return set('padding-bottom', px(val));
    case 'pl': return set('padding-left', px(val));
    case 'm': return four('margin', px(val));
    case 'mt': return set('margin-top', px(val));
    case 'mr': return set('margin-right', px(val));
    case 'mb': return set('margin-bottom', px(val));
    case 'ml': return set('margin-left', px(val));
    case 'rounded': return radius(px(val || '4'));
    case 'w': return set('width', val === 'full' ? '100%' : px(val));
    case 'h': return set('height', val === 'full' ? '100%' : px(val));
    case 'size': { set('width', px(val)); set('height', px(val)); return }
    case 'min-w': return set('min-width', val === 'full' ? '100%' : px(val));
    case 'min-h': return set('min-height', val === 'full' ? '100%' : px(val));
    case 'max-w': return set('max-width', val === 'none' ? 'none' : px(val));
    case 'max-h': return set('max-height', val === 'none' ? 'none' : px(val));
    case 'left': return set('left', px(val));
    case 'right': return set('right', px(val));
    case 'top': return set('top', px(val));
    case 'bottom': return set('bottom', px(val));
    case 'z': return set('z-index', val);
    case 'opacity': return set('opacity', String(+val > 1 ? +val / 100 : +val));
    case 'shadow': return set('box-shadow', val);
    case 'blur': return set('filter', `blur(${px(val)})`);
    case 'backdrop-blur': return set('backdrop-filter', `blur(${px(val)})`);
    case 'rotate': { flags.push(`rotation ${val} — Webflow has no native rotate control via MCP: BAKE the rotation into the exported SVG/asset instead`); return }
    case 'mix-blend': return set('mix-blend-mode', val);
  }
  // bare utilities
  switch (cls) {
    case 'flex': return set('display', 'flex');
    case 'block': return set('display', 'block');
    case 'inline-block': return set('display', 'inline-block');
    case 'grid': return set('display', 'grid');
    case 'hidden': return set('display', 'none');
    case 'flex-col': return set('flex-direction', 'column');
    case 'flex-row': return set('flex-direction', 'row');
    case 'flex-wrap': return set('flex-wrap', 'wrap');
    case 'items-start': return set('align-items', 'flex-start');
    case 'items-center': return set('align-items', 'center');
    case 'items-end': return set('align-items', 'flex-end');
    case 'items-baseline': return set('align-items', 'baseline');
    case 'justify-start': return set('justify-content', 'flex-start');
    case 'justify-center': return set('justify-content', 'center');
    case 'justify-end': return set('justify-content', 'flex-end');
    case 'justify-between': return set('justify-content', 'space-between');
    case 'content-stretch': return set('align-content', 'stretch');
    case 'absolute': return set('position', 'absolute');
    case 'relative': return set('position', 'relative');
    case 'fixed': return set('position', 'fixed');
    case 'sticky': return set('position', 'sticky');
    case 'shrink-0': return set('flex-shrink', '0');
    case 'flex-none': return set('flex-shrink', '0');
    case 'grow': return set('flex-grow', '1');
    case 'uppercase': return set('text-transform', 'uppercase');
    case 'lowercase': return set('text-transform', 'lowercase');
    case 'capitalize': return set('text-transform', 'capitalize');
    case 'italic': return set('font-style', 'italic');
    case 'not-italic': return set('font-style', 'normal');
    case 'text-left': return set('text-align', 'left');
    case 'text-center': return set('text-align', 'center');
    case 'text-right': return set('text-align', 'right');
    case 'whitespace-nowrap': return set('white-space', 'nowrap');
    case 'overflow-hidden': return set('overflow', 'hidden');
    case 'overflow-visible': return set('overflow', 'visible');
    case 'text-white': return set('color', '#FFFFFF');
    case 'text-black': return set('color', '#000000');
    case 'bg-white': return set('background-color', '#FFFFFF');
    case 'bg-black': return set('background-color', '#000000');
    case 'underline': return set('text-decoration', 'underline');
    case 'no-underline': return set('text-decoration', 'none');
    case 'inset-0': { set('top', '0px'); set('right', '0px'); set('bottom', '0px'); set('left', '0px'); return }
    case 'size-full': { set('width', '100%'); set('height', '100%'); return }
    case 'w-full': return set('width', '100%');
    case 'h-full': return set('height', '100%');
    case 'max-w-none': return set('max-width', 'none');
    case 'min-w-full': return set('min-width', '100%');
  }
  if (/^-?rotate-/.test(cls)) { flags.push(`rotation ${cls.replace(/^-?rotate-/, cls.startsWith('-') ? '-' : '')}deg — Webflow exposes no rotate control via MCP: BAKE the rotation into the exported SVG/asset instead`); return }
  if (/^-?(translate|scale|skew)/.test(cls)) { flags.push(`transform utility "${cls}" — reproduce with layout, or bake into the asset; MCP exposes no transform control`); return }
  if (cls.startsWith('[word-break')) return set('word-break', 'break-word');
  if (cls === 'w-[min-content]') return set('width', 'min-content');
  flags.push(`unmapped utility "${cls}" — check it does not hide a real property`);
}

function parse(src) {
  const assets = {};
  for (const m of src.matchAll(/const\s+(\w+)\s*=\s*"([^"]+)"/g)) assets[m[1]] = m[2];

  const nodes = []; const warnings = [];
  const stack = [];
  // Walk tags in document order. Self-closing tags do not push onto the stack.
  const tagRe = /<(\/?)([a-zA-Z][\w.]*)((?:\s+[^>]*?)?)(\/?)>/g;
  let m;
  while ((m = tagRe.exec(src))) {
    const [full, closing, tag, attrsRaw, selfClose] = m;
    if (closing) { if (stack.length) stack.pop(); continue }
    const attrs = attrsRaw || '';
    const nodeId = (attrs.match(/data-node-id="([^"]+)"/) || [])[1] || null;
    const name = (attrs.match(/data-name="([^"]+)"/) || [])[1] || null;
    // className can be a plain string or {className || "..."} — take the quoted literal
    let clsRaw = (attrs.match(/className=\{[^"]*"([^"]*)"/) || attrs.match(/className="([^"]*)"/) || [])[1] || '';
    const srcRef = (attrs.match(/src=\{(\w+)\}/) || [])[1] || null;
    const css = {}; const flags = [];
    for (const c of clsRaw.split(/\s+/).filter(Boolean)) classToCss(c, css, flags);

    // text content = everything up to the matching close tag, if it has no child tags
    let text = null;
    if (!selfClose) {
      const rest = src.slice(m.index + full.length);
      const closeIdx = rest.indexOf(`</${tag}>`);
      if (closeIdx >= 0) {
        const inner = rest.slice(0, closeIdx);
        if (!/</.test(inner)) {
          const t = inner.replace(/\s+/g, ' ').trim();
          if (t && !/^\{/.test(t)) text = t;
        }
      }
    }
    const rec = { nodeId, name, tag, depth: stack.length, parent: stack.length ? stack[stack.length - 1] : null,
      text, src: srcRef ? assets[srcRef] || srcRef : null, css, flags };
    if (nodeId || Object.keys(css).length || text || srcRef) nodes.push(rec);
    for (const f of flags) warnings.push({ nodeId, name, tag, warn: f });
    if (!selfClose && tag !== 'img' && tag !== 'br') stack.push(nodeId || name || tag);
  }
  return { nodes, assets, warnings };
}

if (SELFTEST) {
  const fixture = `
const imgA = "https://x/a.svg";
export default function F() { return (
  <div className="content-stretch flex flex-col gap-[35px] items-start relative size-full" data-node-id="1:1">
    <p className="font-['Yrsa:SemiBold'] font-semibold leading-[80px] text-[#6c461a] text-[70px]" data-node-id="1:2">Hello World.</p>
    <div className="bg-[#835e2c] flex gap-[3px] h-[45px] items-end justify-center p-[10px] relative rounded-[10px] w-[190px]" data-node-id="1:3">
      <div className="-rotate-90 flex-none"><img alt="" className="absolute inset-0 size-full" src={imgA} /></div>
    </div>
  </div>) }`;
  const r = parse(fixture);
  const byId = Object.fromEntries(r.nodes.filter(n => n.nodeId).map(n => [n.nodeId, n]));
  const fails = [];
  const eq = (got, want, what) => { if (String(got) !== String(want)) fails.push(`${what}: got ${got} want ${want}`) };
  eq(byId['1:1'].css['display'], 'flex', 'root display');
  eq(byId['1:1'].css['flex-direction'], 'column', 'root direction');
  eq(byId['1:1'].css['grid-row-gap'], '35px', 'gap -> grid-row-gap LONGHAND');
  eq(byId['1:1'].css['grid-column-gap'], '35px', 'gap -> grid-column-gap LONGHAND');
  eq(byId['1:1'].css['gap'], 'undefined', 'shorthand gap must NOT survive');
  eq(byId['1:2'].css['font-family'], 'Yrsa', 'font family');
  eq(byId['1:2'].css['font-weight'], '600', 'SemiBold -> 600');
  eq(byId['1:2'].css['font-size'], '70px', 'font size');
  eq(byId['1:2'].css['line-height'], '80px', 'line height');
  eq(byId['1:2'].css['color'], '#6c461a', 'text colour');
  eq(byId['1:2'].text, 'Hello World.', 'text content');
  eq(byId['1:3'].css['background-color'], '#835e2c', 'bg');
  eq(byId['1:3'].css['border-top-left-radius'], '10px', 'rounded -> 4 longhands');
  eq(byId['1:3'].css['border-bottom-right-radius'], '10px', 'rounded -> br');
  eq(byId['1:3'].css['border-radius'], 'undefined', 'shorthand radius must NOT survive');
  eq(byId['1:3'].css['padding-left'], '10px', 'p -> padding longhands');
  eq(byId['1:3'].css['width'], '190px', 'width');
  eq(r.warnings.some(w => /rotation/.test(w.warn)), 'true', 'rotation flagged for baking');
  eq(r.nodes.some(n => n.src === 'https://x/a.svg'), 'true', 'asset resolved from const');
  eq(r.warnings.filter(w => /unmapped/.test(w.warn)).length, 0, 'no unmapped utilities in fixture');
  console.log(fails.length ? 'SELF-TEST FAIL\n  ' + fails.join('\n  ') : `self-test ok — ${r.nodes.length} nodes, ${r.warnings.length} warning(s), all longhand assertions pass`);
  process.exit(fails.length ? 1 : 0);
}

const file = argv.filter(a => !a.startsWith('--'))[0];
if (!file || !fs.existsSync(file)) { console.error('usage: node figma-parse.js <node.dc.jsx> [--out=parsed.json] [--json]   |   --self-test'); process.exit(2) }
const res = parse(fs.readFileSync(file, 'utf8'));
if (outFlag) { fs.mkdirSync(path.dirname(path.resolve(outFlag)), { recursive: true }); fs.writeFileSync(outFlag, JSON.stringify(res, null, 1)) }
if (JSONOUT) { console.log(JSON.stringify(res, null, 1)); process.exit(0) }
console.log(`PARSED ${path.basename(file)} — ${res.nodes.length} nodes, ${Object.keys(res.assets).length} asset(s), ${res.warnings.length} warning(s)`);
for (const n of res.nodes) {
  const props = Object.entries(n.css).map(([k, v]) => `${k}:${v}`).join(' ');
  console.log(`  ${'  '.repeat(n.depth)}${n.nodeId || n.name || n.tag}${n.text ? ' "' + n.text.slice(0, 42) + (n.text.length > 42 ? '…' : '') + '"' : ''}${n.src ? ' [asset]' : ''}`);
  if (props) console.log(`  ${'  '.repeat(n.depth)}   ${props}`);
}
for (const w of res.warnings) console.log(`  warn ${w.nodeId || w.tag}: ${w.warn}`);
if (outFlag) console.log(`  -> ${outFlag}`);
