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
  'flex-grow', 'flex-shrink', 'flex-basis', 'align-self', 'order', 'grid-template-columns', 'grid-template-rows', 'grid-auto-flow',
  'column-gap', 'row-gap', 'gap', 'position', 'top', 'right', 'bottom', 'left', 'z-index',
  'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
  'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
  'font-family', 'font-size', 'font-weight', 'line-height', 'letter-spacing', 'text-transform',
  'text-align', 'text-decoration', 'color', 'background-color', 'background-image', 'opacity',
  'border-radius', 'border-top-left-radius', 'border-top-right-radius', 'border-bottom-left-radius',
  'border-bottom-right-radius',
  // ALL FOUR sides, all three facets. KEEP used to carry top+bottom width but only top style/colour, so a
  // 1px box border compiled as a two-sided border with one styled edge — a visible defect on every card,
  // input and divider, and invisible in the plan unless you read it property by property.
  'border-top-width', 'border-right-width', 'border-bottom-width', 'border-left-width',
  'border-top-style', 'border-right-style', 'border-bottom-style', 'border-left-style',
  'border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color',
  'box-shadow', 'filter', 'backdrop-filter', 'mix-blend-mode', 'object-fit', 'aspect-ratio', 'transition',
  'overflow', 'max-width', 'width', 'height', 'min-height', 'flex-basis', 'text-overflow', 'white-space']);
const SHORTHAND = {
  'gap': ['grid-row-gap', 'grid-column-gap'],
  'row-gap': ['grid-row-gap'], 'column-gap': ['grid-column-gap'],
  'border-radius': ['border-top-left-radius', 'border-top-right-radius', 'border-bottom-left-radius', 'border-bottom-right-radius'],
};
// intrinsic sizes are authored; a text node's measured width is not
const INTRINSIC_TAGS = new Set(['img', 'svg', 'video', 'canvas']);
// Tags Webflow ships with NON-ZERO default margins. A reference that resets margins to 0 must say so
// explicitly for these, or the Webflow default silently applies. See the margin block in authoredProps.
// WEBFLOW'S OWN BASE STYLESHEET (v2.1.17) — the single largest source of "built does not equal reference".
//
// Webflow ships a normalize + component stylesheet. Any property it sets is NON-ZERO by default, so a
// property the reference computes as 0 — which the compiler therefore omits — does NOT come out as 0 on
// the page. Webflow's value wins. "Absent from the plan" means "Webflow decides".
//
// Measured cost of learning this the hard way, in ONE session (2026-08-22):
//   h3 20px top / ul 10px bottom margins  -> a card 30px too tall
//   .w-dropdown-toggle padding 20px       -> a 28px nav bar rendered 40px
//   .w-dropdown margin-left/right auto    -> flex siblings sized unevenly
// Three publishes, one root cause. This is not a Dropdown bug or a heading bug: it is a CLASS of bug that
// recurs on every new site, because every site uses some native module.
//
// The rule: for any tag or module Webflow is known to style, author the reference's computed value
// EXPLICITLY — including zero, and including when the extractor dropped it for being zero.
const WF_DEFAULTS = {
  h1: ['margin-top', 'margin-bottom'], h2: ['margin-top', 'margin-bottom'],
  h3: ['margin-top', 'margin-bottom'], h4: ['margin-top', 'margin-bottom'],
  h5: ['margin-top', 'margin-bottom'], h6: ['margin-top', 'margin-bottom'],
  p: ['margin-top', 'margin-bottom'],
  blockquote: ['margin-top', 'margin-bottom', 'padding-top', 'padding-bottom', 'padding-left', 'padding-right'],
  figure: ['margin-top', 'margin-bottom', 'margin-left', 'margin-right'],
  pre: ['margin-top', 'margin-bottom'],
  ul: ['margin-top', 'margin-bottom', 'padding-left'],
  ol: ['margin-top', 'margin-bottom', 'padding-left'],
  input: ['margin-top', 'margin-bottom', 'padding-top', 'padding-bottom', 'padding-left', 'padding-right', 'height'],
  textarea: ['margin-top', 'margin-bottom', 'padding-top', 'padding-bottom', 'padding-left', 'padding-right'],
  select: ['margin-top', 'margin-bottom', 'padding-top', 'padding-bottom', 'height'],
  button: ['padding-top', 'padding-bottom', 'padding-left', 'padding-right'],
  label: ['margin-top', 'margin-bottom'],
  form: ['margin-top', 'margin-bottom'],
  fieldset: ['margin-top', 'margin-bottom', 'padding-top', 'padding-bottom', 'padding-left', 'padding-right'],
};
// Native MODULE defaults, keyed by the element type the compiler emits. These cost a publish each, because
// the module's own w-class is invisible both in the reference and in the plan.
const WF_MODULE_DEFAULTS = {
  // Verified against Webflow's served stylesheet 2026-08-22:
  //   .w-dropdown { margin-left:auto; margin-right:auto; display:inline-block }
  //   .w-dropdown-btn, .w-dropdown-toggle, .w-dropdown-link { margin-left:auto; margin-right:auto }
  // `display` matters as much as the margins: an inline-block wrapper sitting in a flex row does not share
  // width the way its siblings do, which is how four nav pills came out 238px against a plain link's 266px.
  Dropdown:       ['display', 'margin-left', 'margin-right', 'padding-top', 'padding-bottom', 'padding-left', 'padding-right'],
  DropdownToggle: ['display', 'margin-left', 'margin-right', 'padding-top', 'padding-bottom', 'padding-left', 'padding-right'],
  DropdownLink:   ['display', 'margin-left', 'margin-right', 'padding-top', 'padding-bottom', 'padding-left', 'padding-right'],
  Slider:         ['height', 'background-color'],
  Tabs:           ['margin-top', 'margin-bottom'],
  Navbar:         ['padding-top', 'padding-bottom', 'padding-left', 'padding-right', 'background-color'],
  Form:           ['margin-top', 'margin-bottom'],
  FormTextInput:  ['margin-bottom', 'padding-top', 'padding-bottom', 'padding-left', 'padding-right', 'height'],
  FormButton:     ['padding-top', 'padding-bottom', 'padding-left', 'padding-right'],
  Button:         ['padding-top', 'padding-bottom', 'padding-left', 'padding-right'],
  List:           ['margin-top', 'margin-bottom', 'padding-left'],
  ListItem:       ['margin-top', 'margin-bottom'],
  Blockquote:     ['margin-top', 'margin-bottom', 'padding-left', 'padding-right'],
  RichText:       ['margin-top', 'margin-bottom'],
};
const WF_MARGIN_DEFAULT_TAGS = new Set(Object.keys(WF_DEFAULTS));


// ── Naming is NOT the reference's problem to solve ───────────────────────────────────────────────
// v2.1.8: this compiler originally took the reference's BEM suffix as the class name, because the site it
// was first written against used BEM. On a utility-class reference (Tailwind) the bar, the nav and the
// button group all carry `flex`, so all three COLLAPSED into one class and styling one restyled the others.
// On a hashed reference (styled-components / CSS modules) it emitted `site-header__css-1a2b3c` — garbage
// baked permanently into the client's site. A reference's class names are an accident of its build tool.
//
// So: class IDENTITY comes from (element role + authored-style fingerprint), never from the reference's
// class string. The reference's name is used only when it is SEMANTIC, and only to make the name readable.
const UTILITY_RE = /^(?:-?[a-z]+:)?(?:sm|md|lg|xl|2xl):?|^(?:flex|grid|block|inline|hidden|relative|absolute|fixed|sticky|container|row|col)$|^(?:[mp][xytblr]?|w|h|min|max|gap|space|text|bg|border|rounded|shadow|opacity|z|top|left|right|bottom|justify|items|content|self|order|basis|grow|shrink|font|leading|tracking|uppercase|lowercase|capitalize|truncate|overflow|cursor|transition|duration|ease|delay|scale|rotate|translate|hover|focus|group)(?:-|$)/;
const OPAQUE_RE = /^(?:css|sc|emotion|jsx|styles?|module)[-_][a-z0-9]{4,}$|^[a-z]{1,3}[A-Za-z]*[0-9][A-Za-z0-9]{3,}$|^[a-f0-9]{6,}$/i;

function namingStyleOf(nodes) {
  let semantic = 0, utility = 0, opaque = 0, counted = 0;
  for (const n of nodes) {
    const toks = String(n.class || '').split(/\s+/).filter(Boolean);
    if (!toks.length) continue;
    counted++;
    if (toks.some(t => t.includes('__'))) { semantic++; continue }
    if (toks.some(t => OPAQUE_RE.test(t))) { opaque++; continue }
    if (toks.length >= 3 && toks.filter(t => UTILITY_RE.test(t)).length >= Math.ceil(toks.length / 2)) { utility++; continue }
    if (toks.some(t => t.length >= 8 && t.includes('-'))) { semantic++; continue }
    utility++;
  }
  if (!counted) return 'none';
  if (semantic / counted >= 0.4) return 'semantic';
  if (opaque / counted >= 0.3) return 'opaque';
  return 'utility';
}

// A readable role for a node, derived from what it IS — works on any reference, with or without classes.
function roleOf(n, kids, sizeRank) {
  const t = String(n.tag || '').toLowerCase();
  const s = n.styles || {}; const b = n.box || {};
  if (t === 'img' || t === 'svg') return (b.w && b.w <= 64 && b.h && b.h <= 64) ? 'icon' : 'image';
  if (/^h[1-6]$/.test(t)) return 'heading';
  if (t === 'button') return 'button';
  if (t === 'a') return kids.length ? 'link-block' : 'link';
  if (t === 'nav') return 'nav';
  if (t === 'ul' || t === 'ol') return 'list';
  if (t === 'li') return 'list-item';
  if (n.text && !kids.length) {
    if (sizeRank === 0) return 'title';
    if (sizeRank === 1) return 'subtitle';
    const fs = parseFloat(s['font-size'] || '0');
    if (fs && fs <= 12) return 'eyebrow';
    return 'text';
  }
  if (String(s.display || '').includes('grid')) return 'grid';
  if (String(s.display || '').includes('flex')) return String(s['flex-direction'] || '').startsWith('column') ? 'col' : 'row';
  return 'group';
}

// Fingerprint = tag + the authored properties that actually matter. Two nodes share a class only if this
// matches; that is what stops three different `flex` containers from becoming one class.
function fingerprint(tag, role, props) {
  const keys = Object.keys(props).sort();
  return [tag, role, ...keys.map(k => k + ':' + props[k])].join('|');
}

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
  const NATIVE_FONTS = new Set(); const NATIVE_DROPPED = [];
  const maxDepth = Number(opt('max-depth') || 99);
  const d = JSON.parse(fs.readFileSync(src, 'utf8'));
  const nodes = d.nodes || d.elements || [];
  // Mark which nodes have element children, so the element TYPE can be resolved while properties are being
  // authored (the Webflow-default reset table keys off the module, not just the tag).
  for (let i = 0; i < nodes.length; i++) {
    const nx = nodes[i + 1];
    nodes[i].__hasKids = !!(nx && typeof nx.depth === 'number' && typeof nodes[i].depth === 'number' && nx.depth > nodes[i].depth);
  }
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
  const naming = namingStyleOf(nodes);
  // font-size ranking gives "title"/"subtitle" real meaning on a reference with no useful class names
  const sizes = [...new Set(nodes.map(n => parseFloat((n.styles || {})['font-size'] || '0')).filter(Boolean))].sort((a, b) => b - a);
  const rankOf = n => sizes.indexOf(parseFloat((n.styles || {})['font-size'] || '0'));

  const byFingerprint = new Map();     // (tag|role|props) -> generated class name   <- class IDENTITY
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

  // readable NAME (may repeat across different fingerprints; disambiguated with -2, -3)
  const nameHintFor = n => {
    const kids = childrenOf.get(n.path) || [];
    const role = roleOf(n, kids, rankOf(n));
    let hint = null;
    if (naming === 'semantic') {
      let sig = refSig(n);
      if (sig && MODULE_WORDS.test(sig)) {
        const sz = kids.map(k => `${Math.round((k.box || {}).w || 0)}x${Math.round((k.box || {}).h || 0)}`);
        const repeated = sz.length >= 2 && new Set(sz).size < sz.length;
        if (!repeated) { const was = sig; sig = sig.replace(MODULE_WORDS, 'cards'); renames.push(`${was} -> ${sig} (renders statically here: ${kids.length} child(ren), no repeated slide box)`) }
        else moduleNeeded.push(`${sig} at ${n.path} — build the NATIVE module, not a div`);
      }
      hint = sig;
    }
    // utility / opaque / classless references: the reference's own names are worthless or harmful
    if (!hint) hint = role;
    return { hint: kebab(hint), role };
  };

  const authoredProps = n => {
    const s2 = n.styles || {}; const out = {};
    for (const [k, v] of Object.entries(s2)) {
      if (!KEEP.has(k)) continue;
      if (v === undefined || v === null || v === '' || (v === 'auto' && !['top', 'right', 'bottom', 'left'].includes(k))) continue;
      // ---- Invariant 5: emit only what Webflow's NATIVE style panel can hold ----
      // A CSS fallback stack or a clamp()/min()/max() value is stored by data_style_tool as a
      // Designer CUSTOM PROPERTY: it emits CSS, passes every pixel gate, and is not native.
      if (k === 'font-family') {
        const fam = font || String(v).split(',')[0].replace(/["']/g, '').trim();
        if (fam) { out[k] = fam; NATIVE_FONTS.add(fam) }
        continue;
      }
      if (/(^|[^a-z0-9_-])(clamp|min|max|env)\s*\(/i.test(String(v))) { NATIVE_DROPPED.push(`${k}: ${v}`); continue }
      if (['width', 'height', 'min-height', 'flex-basis', 'max-width'].includes(k)) {
        const frac = /^\d+(\.\d+)?px$/.test(String(v)) && /\.\d/.test(String(v));
        const b = n.box || {};
        const iconSized = b.w > 0 && b.w <= 64 && b.h > 0 && b.h <= 64;
        const intrinsic = INTRINSIC_TAGS.has(n.tag) || (iconSized && /icon|logo|avatar|badge|mark|chevron|arrow/i.test(String(n.class || '')));
        if (frac && !intrinsic) continue;
      }
      // A computed `grid-template-columns` resolves fr units to pixels: `1fr 1fr` reads back as
      // `496px 496px`. Authoring that pins the grid to the capture viewport and it will overflow every
      // narrower one. Re-express pixel tracks as the fr ratio they came from.
      if (k === 'grid-template-columns' || k === 'grid-template-rows') {
        const parts = String(v).trim().split(/\s+/);
        if (parts.length > 1 && parts.every(t => /^\d+(\.\d+)?px$/.test(t))) {
          const nums = parts.map(parseFloat);
          const min = Math.min(...nums);
          const fr = nums.map(x => { const r = x / min; return (Math.abs(r - Math.round(r)) < 0.02 ? Math.round(r) : +r.toFixed(2)) + 'fr'; });
          out[k] = fr.every(f => f === '1fr') ? `repeat(${fr.length}, 1fr)` : fr.join(' ');
          continue;
        }
      }
      if (k === 'transition') { Object.assign(out, expandTransition(v)); continue }
      if (SHORTHAND[k]) { for (const long of SHORTHAND[k]) out[long] = v; continue }
      out[k] = v;
    }
    // A border WIDTH on a side with no border-style renders nothing: CSS defaults style to `none`. Older
    // captures only recorded the top side's style/colour, so a 1px box border compiled into a single top
    // edge. Mirror whichever side we have onto the sides that carry a width but no style.
    {
      const sides = ['top', 'right', 'bottom', 'left'];
      const anyStyle = sides.map(s => out[`border-${s}-style`]).find(Boolean);
      const anyColor = sides.map(s => out[`border-${s}-color`]).find(Boolean);
      for (const s of sides) {
        const w = parseFloat(out[`border-${s}-width`]);
        if (!w) continue;
        if (!out[`border-${s}-style`] && anyStyle) out[`border-${s}-style`] = anyStyle;
        if (!out[`border-${s}-color`] && anyColor) out[`border-${s}-color`] = anyColor;
      }
    }

    // ── WEBFLOW'S DEFAULT TYPOGRAPHY MARGINS (v2.1.16) ────────────────────────────────────────────────
    // A reference with `* { margin: 0 }` computes margin-top/bottom as 0px, and a 0 looks like "nothing to
    // author" — so the compiler dropped it. But Webflow does NOT start from zero: it ships default margins
    // on headings, paragraphs and lists (h3 gets 20px top / 10px bottom, ul gets 10px bottom). "Absent" in
    // the plan therefore means 20px on the page, not 0. Measured 2026-08-22: a card came out exactly 30px
    // taller than its reference — h3 margin-top 20 + ul margin-bottom 10, with the h3's bottom margin
    // collapsing into the ul's top margin. Every heading, paragraph and list built from an HTML reference
    // carries this, and it is invisible in the plan because the property simply is not there.
    // So: when the reference computes a zero margin on an element Webflow gives a default to, author the
    // zero EXPLICITLY. An explicit 0 is design intent here, not noise.
    {
      const tag = String(n.tag || '').toLowerCase();
      let wfType = null;
      try { wfType = typeof typeFor === 'function' ? (typeFor(n, n.__hasKids) || {}).type : null; } catch (e) {}
      const forced = new Set([...(WF_DEFAULTS[tag] || []), ...(WF_MODULE_DEFAULTS[wfType] || [])]);
      for (const k of forced) {
        if (out[k] !== undefined) continue;          // reference has a real value; already authored above
        const raw = (n.styles || {})[k];
        // ABSENT means zero: the extractor drops zero-valued properties to keep captures small, so a reset
        // never reaches the plan — and "not in the plan" is exactly how Webflow's default wins.
        const v = raw === undefined ? 0 : parseFloat(raw);
        if (!isFinite(v)) continue;
        out[k] = (v === 0) ? '0px' : raw;
      }
    }

    // ── SNAPSHOT ARTIFACTS (v2.1.15) ───────────────────────────────────────────────────────────────
    // A capture is a photograph of ONE viewport, not a design. Several computed values are measurements of
    // that moment, and authoring them as CSS breaks every other width. Measured 2026-08-22 on a real build:
    // the compiler emitted `height` on all 7 classes, `margin-left/right: 120px` (the computed value of
    // `auto`), `max-width: 1440px` (the viewport itself) and `max-width: 1136px` (the parent's content box).
    // Fifteen properties had to be hand-corrected before the first write, and shipping them unedited would
    // have broken every breakpoint. The compiler must emit design INTENT, never the measurement.
    const VW = (d.viewport && (d.viewport.width || d.viewport.w)) || 0;
    const isIntrinsic = INTRINSIC_TAGS.has(n.tag);

    // 1. Computed height is a layout RESULT — content sizes itself. Only intrinsic media keeps a measured box.
    if (!isIntrinsic) { delete out.height; delete out['min-height']; }

    // 2. `margin: auto` resolves to equal pixel margins in a computed style. That signature is a centred
    //    block; re-author it as `auto` so it stays centred instead of pinning to one viewport's arithmetic.
    const ml = out['margin-left'], mr = out['margin-right'];
    if (ml && mr && ml === mr && /^\d+(\.\d+)?px$/.test(String(ml)) && parseFloat(ml) > 0) {
      out['margin-left'] = 'auto'; out['margin-right'] = 'auto';
    }

    // 3. Inherited defaults leaking in: `line-height: normal` is the default, and a colour on a node that
    //    carries no text is the browser's inherited value — authoring it puts black text on a dark section
    //    the moment anyone adds a child.
    if (out['line-height'] === 'normal') delete out['line-height'];
    if (out.color && !(n.text && String(n.text).trim())) delete out.color;

    // 4. A width equal to the parent's CONTENT box is not a constraint, it is just "block fills its parent".
    //    Authoring it (and the max-width the fluid rule then derives from it) is what produced the bogus
    //    `max-width: 1136px`. Only a width genuinely NARROWER than the parent is design intent.
    const parentInner = (() => {
      if (!Array.isArray(nodes) || typeof n.depth !== 'number') return VW;
      const i = nodes.indexOf(n);
      for (let j = i - 1; j >= 0; j--) {
        const p = nodes[j];
        if (typeof p.depth === 'number' && p.depth < n.depth) {
          const pb = (p.box && p.box.w) || VW;
          const inset = ['padding-left', 'padding-right', 'border-left-width', 'border-right-width']
            .reduce((s, k) => s + (parseFloat((p.styles || {})[k]) || 0), 0);
          return Math.max(0, pb - inset);
        }
      }
      return VW;
    })();
    const ownW = parseFloat(out.width);
    //    EQUALITY only, never ">=": a child WIDER than its parent is overflowing on purpose (a bleed, a
    //    marquee, an oversized card) and that width is real design intent. An earlier cut used ">=" and
    //    deleted exactly that case — caught by this file's own container-fluidity test.
    if (!isIntrinsic && out.width && /^\d+(\.\d+)?px$/.test(String(out.width)) &&
        parentInner && Math.abs(ownW - parentInner) <= 1) {
      delete out.width;                       // full-bleed inside its parent: say nothing, let it be a block
      if (out['max-width'] && Math.abs(parseFloat(out['max-width']) - ownW) < 1) delete out['max-width'];
    }
    // 4b. A direct child of a grid or flex container is sized BY THE CONTAINER. Its measured width is the
    //     track it landed in, not a constraint anyone authored — `1fr 1fr` gave a card `max-width: 496px`,
    //     which then fights the grid at every other viewport. Let the container do its job.
    if (!isIntrinsic && Array.isArray(nodes) && typeof n.depth === 'number') {
      const i2 = nodes.indexOf(n);
      for (let j = i2 - 1; j >= 0; j--) {
        const p2 = nodes[j];
        if (typeof p2.depth === 'number' && p2.depth < n.depth) {
          // Only a FR-BASED grid track is definitely not design intent: `1fr 1fr` sizes the child, so its
          // measured width is the track. A grid with no fr tracks (or a flex row) may well contain a child
          // whose width the author really did set, and an earlier cut of this deleted exactly that —
          // caught by this file's own container-fluidity test. Narrow signal, not a broad one.
          const ps = p2.styles || {};
          // The PARENT is read from the raw capture, where a fr grid has already been resolved to pixel
          // tracks — so test the signature (a multi-track template), not the literal `fr`. A grid with no
          // template at all still sizes children by content, so it stays exempt: that is the fixture case
          // this file's container-fluidity test guards.
          const tracks = String(ps['grid-template-columns'] || '').trim();
          const multiTrack = tracks && tracks.split(/\s+/).length > 1;
          if (/grid/.test(String(ps.display || '')) && multiTrack) { delete out.width; delete out['max-width']; }
          // A TEXT-bearing child of a FLEX container is shrink-to-fit: its measured width IS its text, not a
          // constraint anyone authored. Baking it pins a label to the width of the word that happened to be
          // in it — measured 2026-08-22, an "About" nav label compiled with `max-width: 34px`. A text child
          // of a BLOCK parent is left alone, because there the width usually is a real authored max-width.
          if (/flex/.test(String(ps.display || '')) && n.text && String(n.text).trim()) {
            delete out.width; delete out['max-width'];
          }
          break;
        }
      }
    }

    // 5. A max-width equal to the capture viewport is the viewport, not a constraint.
    if (out['max-width'] && VW && Math.abs(parseFloat(out['max-width']) - VW) < 1) delete out['max-width'];

    // fluid base (Rule 7) — a REAL width constraint becomes width:100% + max-width so it scales down.
    // It must NOT hand back the viewport width as a max-width: that is the artifact the scrub just removed.
    if (out.width && /^\d+(\.\d+)?px$/.test(String(out.width)) && !INTRINSIC_TAGS.has(n.tag)) {
      const px = String(out.width); out.width = '100%';
      const isViewport = VW && Math.abs(parseFloat(px) - VW) < 1;
      if (!isViewport && (!out['max-width'] || out['max-width'] === 'none')) out['max-width'] = px;
      if (isViewport) delete out.width;      // full-bleed section: a block is already full width
    }
    // Rule 15
    if (INTRINSIC_TAGS.has(n.tag)) {
      out['flex-shrink'] = '0';
      const b = n.box || {};
      if (!out.width && b.w) out.width = Math.round(b.w) + 'px';
      if (!out.height && b.h) out.height = Math.round(b.h) + 'px';
    }
    return out;
  };

  // CLASS IDENTITY = tag + role + authored props. Same look and same job -> one shared class (a semantic
  // reference still collapses to a few dozen). Different look -> different class, even if the reference
  // gave them the same utility token. This is the whole fix for non-BEM references.
  const classFor = n => {
    const props = authoredProps(n);
    const { hint, role } = nameHintFor(n);
    const fp = fingerprint(n.tag, role, props);
    if (byFingerprint.has(fp)) return byFingerprint.get(fp);
    let name = `${prefix}__${hint}`, i = 2;
    while (usedNames.has(name)) name = `${prefix}__${hint}-${i++}`;
    usedNames.add(name);
    byFingerprint.set(fp, name);
    classProps.set(name, props);
    return name;
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
    const cls = classFor(n);
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
    section, width: (d.viewport && (d.viewport.width || d.viewport.w)) || 1440,
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
  console.log(`  reference naming   ${naming}${naming === 'semantic' ? ' (its BEM suffixes are readable, so names reuse them)' : ' (its class names are ' + (naming === 'opaque' ? 'hashed/build-generated' : naming === 'utility' ? 'utility soup' : 'absent') + ' — names derived from ROLE instead)'}`);
  console.log(`  nodes in extract   ${nodes.length}`);
  console.log(`  nodes planned      ${planned}   (skipped ${skips.length})`);
  console.log(`  shared classes     ${classes.length}   <- ${nodes.length} nodes collapse to this many authored classes`);
  console.log(`  strings carried    ${strings.length}   <- replica coverage target; content-coverage.js enforces it`);
  console.log(`  media needing an asset  ${needsAsset}   (upload + bind by id; inline svg -> pre-flight per Rule 15)`);
  if (font) console.log(`  font substituted   every family -> ${font} (reference family is proprietary; deliberate, recorded)`);
  // Invariant 5 report — the pipeline gates on these two lines, they are not decoration.
  if (NATIVE_FONTS.size) console.log(`  fonts required     ${[...NATIVE_FONTS].join(', ')}  <- each must exist in Site Settings > Fonts BEFORE the build writes, or the face silently falls back and the section can never reach the pixel floor`);
  if (NATIVE_DROPPED.length) console.log(`  non-native values   ${NATIVE_DROPPED.length} dropped (clamp/min/max/env cannot be held by a Webflow size field): ${NATIVE_DROPPED.slice(0, 4).join(' · ')}${NATIVE_DROPPED.length > 4 ? ' …' : ''}
                      author these as a base value + real breakpoint overrides, each measured from the reference at that width`);
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
      { tag: 'header', depth: 0, path: 'header', class: 'site-nav', box: { x: 0, y: 0, w: 1440, h: 80 }, styles: { display: 'flex', height: '80px', 'padding-left': '40px', gap: '32px', 'font-family': 'Clarkson, Helvetica', transition: 'background-color 0.5s cubic-bezier(0.165, 0.84, 0.44, 1), top 0.3s ease' } },
      { tag: 'a', depth: 1, path: 'header>a', class: 'site-nav__logo-link', href: '/', box: { x: 40, y: 25, w: 208, h: 30 }, styles: { display: 'block', width: '208.4px' } },
      { tag: 'span', depth: 2, path: 'header>a>span', class: 'site-nav__logo-text', text: 'ACMEWORKS', box: { x: 40, y: 25, w: 200, h: 30 }, styles: { 'font-size': '20px', color: 'rgb(255,255,255)' } },
      { tag: 'a', depth: 1, path: 'header>a[2]', class: 'site-nav__skip-link', href: '#content', box: { x: -1000, y: 40, w: 48, h: 48 }, styles: {} },
      { tag: 'div', depth: 1, path: 'header>div[3]', class: 'site-nav__menu', box: { x: 400, y: 0, w: 600, h: 80 }, styles: { display: 'grid', 'border-radius': '10px' } },
      { tag: 'span', depth: 2, path: 'header>div[3]>span', class: 'site-nav__eyebrow', text: 'Website', box: { x: 410, y: 10, w: 60, h: 14 }, styles: { 'font-size': '11px', width: '59.44px' } },
      { tag: 'h2', depth: 2, path: 'header>div[3]>h2', class: 'site-nav__blade-title', text: 'Acme Premium', box: { x: 410, y: 30, w: 200, h: 20 }, styles: { 'font-size': '15px' } },
      { tag: 'img', depth: 2, path: 'header>div[3]>img', class: 'site-nav__blade-img', box: { x: 700, y: 10, w: 24, h: 24 }, styles: { width: '24px', height: '24px' } },
      // a CONTAINER with a bare px width: the reference viewport is not responsive intent (Rule 7)
      { tag: 'div', depth: 2, path: 'header>div[3]>div[2]', class: 'site-nav__inner', box: { x: 410, y: 10, w: 1200, h: 60 }, styles: { display: 'flex', width: '1200px' } },
      // a fr grid resolved to pixel tracks, and a bordered child sized BY that grid
      { tag: 'div', depth: 1, path: 'header>div[4]', class: 'site-nav__grid', box: { x: 0, y: 100, w: 1120, h: 200 },
        styles: { display: 'grid', 'grid-template-columns': '496px 496px', 'column-gap': '64px' } },
      { tag: 'div', depth: 2, path: 'header>div[4]>div', class: 'site-nav__card', box: { x: 0, y: 100, w: 496, h: 200 },
        styles: { display: 'block', width: '496px', 'background-color': 'rgb(255,255,255)',
          'border-top-width': '1px', 'border-right-width': '1px', 'border-bottom-width': '1px', 'border-left-width': '1px',
          'border-top-style': 'solid', 'border-top-color': 'rgb(227,231,242)' } },
      // a reset list + heading: the reference computes zero margins, Webflow's defaults are NOT zero
      { tag: 'ul', depth: 1, path: 'header>ul', class: 'site-nav__menu-list', box: { x: 0, y: 300, w: 300, h: 60 }, styles: { display: 'block' } },
      { tag: 'li', depth: 2, path: 'header>ul>li', class: 'site-nav__menu-item', text: 'One', box: { x: 0, y: 300, w: 300, h: 20 }, styles: { display: 'list-item' } },
      { tag: 'h3', depth: 1, path: 'header>h3', class: 'site-nav__title', text: 'Heading here', box: { x: 0, y: 380, w: 300, h: 26 }, styles: { 'font-size': '18px' } },
    ],
  }));
  const run = a => { const r = require('child_process').spawnSync(process.execPath, [__filename, ...a], { encoding: 'utf8' }); return { code: r.status, out: (r.stdout || '') + (r.stderr || '') } };
  const planOut = path.join(tmp, 'p.json');
  const r = run([ex, '--prefix=acme-header', '--font=Inter', '--out-plan=' + planOut, '--out-contract=' + path.join(tmp, 'c.json')]);
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
    ['class names re-prefixed from the reference BEM', cls.includes('acme-header__logo-text'), true],
    ['proprietary font substituted', flat.includes('Clarkson'), false],
    ['fractional text width dropped', flat.includes('208.4px') || flat.includes('59.44px'), false],
    ['intrinsic img size kept', flat.includes('"width":"24px"'), true],
    // ── snapshot-artifact scrub (v2.1.15). A capture is a photograph of one viewport; authoring its
    //    measurements breaks every other width. Each of these shipped in a real compiled plan on 2026-08-22.
    ['computed height dropped on non-intrinsic elements',
      plan.classes.some(c => !/-img$/.test(c.name) && c.properties && c.properties.height), false],
    ['intrinsic media KEEPS its measured height',
      plan.classes.some(c => /-img$/.test(c.name) && c.properties && c.properties.height === '24px'), true],
    ['no max-width equal to the capture viewport',
      JSON.stringify(plan.classes).includes('"max-width":"1440px"'), false],
    ['a width equal to the parent content box is not authored',
      plan.classes.some(c => c.properties && c.properties['max-width'] === '1136px'), false],
    ['a genuinely narrower width IS kept as a fluid constraint',
      plan.classes.some(c => c.properties && c.properties.width === '100%' && c.properties['max-width'] === '1200px'), true],
    ['line-height:normal not authored',
      JSON.stringify(plan.classes).includes('"line-height":"normal"'), false],
    // ── border + grid fidelity (v2.1.15). Each of these shipped a visible defect on the first real card.
    // ── border + grid fidelity (v2.1.15). Each shipped a visible defect on the first real card.
    // Matched by PROPERTY, not by class name: the fixture's naming is not what is under test here.
    ['a 1px box border keeps ALL FOUR widths', (() => {
      const c = plan.classes.find(x => x.properties && x.properties['border-top-width']);
      return !!c && ['top', 'right', 'bottom', 'left'].every(s => c.properties[`border-${s}-width`] === '1px');
    })(), true],
    ['every bordered side gets a style (a width with no style renders NOTHING)', (() => {
      const c = plan.classes.find(x => x.properties && x.properties['border-top-width']);
      return !!c && ['top', 'right', 'bottom', 'left'].every(s => c.properties[`border-${s}-style`] === 'solid');
    })(), true],
    ['every bordered side gets a colour', (() => {
      const c = plan.classes.find(x => x.properties && x.properties['border-top-width']);
      return !!c && ['top', 'right', 'bottom', 'left'].every(s => !!c.properties[`border-${s}-color`]);
    })(), true],
    ['resolved pixel grid tracks become fr again', (() => {
      const g = plan.classes.find(x => x.properties && x.properties['grid-template-columns']);
      return !!g && /fr/.test(String(g.properties['grid-template-columns']));
    })(), true],
    // ── Webflow default resets (v2.1.17). Webflow's base stylesheet is non-zero, so a property the
    //    reference computes as 0 must be authored EXPLICITLY or Webflow's value silently wins. Three
    //    separate publishes were spent relearning this on 2026-08-22.
    ['a reset ul authors its zero margins AND Webflow indent explicitly', (() => {
      const c = plan.classes.find(x => /menu-list$/.test(x.name)) || { properties: {} };
      return c.properties['margin-top'] === '0px' && c.properties['margin-bottom'] === '0px'
        && c.properties['padding-left'] === '0px';
    })(), true],
    ['a reset heading authors its zero margins explicitly', (() => {
      const c = plan.classes.find(x => /title$/.test(x.name)) || { properties: {} };
      return c.properties['margin-top'] === '0px' && c.properties['margin-bottom'] === '0px';
    })(), true],
    ['a child of a multi-track grid does NOT carry the track as its width', (() => {
      const c = plan.classes.find(x => x.properties && x.properties['border-top-width']);
      return !!c && !c.properties.width && !c.properties['max-width'];
    })(), true],
    ['image flagged as needing an asset', flat.includes('needsAsset'), true],
    ['container px width becomes fluid 100% + max-width', flat.includes('"width":"100%"') && flat.includes('"max-width"'), true],
    ['transition shorthand expanded (preflight blocks it otherwise)', flat.includes('transition-timing-function'), true],
    ['cubic-bezier survived paren-aware splitting', flat.includes('cubic-bezier(0.165, 0.84, 0.44, 1)'), true],
    ['every reference string carried', ['ACMEWORKS', 'Website', 'Acme Premium'].every(s => flat.includes(s)), true],
  ];
  let ok = true;
  for (const [name, got, want] of cases) { const pass = got === want; ok = ok && pass; console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}` + (pass ? '' : `  (got ${JSON.stringify(got)}, want ${JSON.stringify(want)})`)) }

  // ── the reference's class convention must not decide the output (v2.1.8) ─────────────────────
  // A utility-class reference put `flex` on three structurally different containers; keying classes on the
  // reference's names collapsed all three into one, so styling the bar restyled the nav and the buttons.
  const util = path.join(tmp, 'util.json');
  fs.writeFileSync(util, JSON.stringify({ url: 'https://u.com/', viewport: { width: 1440 }, nodes: [
    { tag: 'header', depth: 0, path: 'header', class: 'flex items-center justify-between px-10 h-20', box: { x: 0, y: 0, w: 1440, h: 80 }, styles: { display: 'flex', height: '80px', 'padding-left': '40px' } },
    { tag: 'div', depth: 1, path: 'header>div', class: 'flex gap-8', box: { x: 400, y: 0, w: 600, h: 80 }, styles: { display: 'flex', 'column-gap': '32px' } },
    { tag: 'div', depth: 1, path: 'header>div[2]', class: 'flex gap-4', box: { x: 1100, y: 20, w: 300, h: 40 }, styles: { display: 'flex', 'column-gap': '16px' } },
    { tag: 'a', depth: 2, path: 'header>div>a', class: 'text-sm uppercase', text: 'Product', box: { x: 410, y: 30, w: 70, h: 20 }, styles: { 'font-size': '14px' } },
  ] }));
  const up = path.join(tmp, 'u.plan.json');
  run([util, '--prefix=site-header', '--out-plan=' + up, '--out-contract=' + path.join(tmp, 'u.c.json')]);
  const uplan = JSON.parse(fs.readFileSync(up, 'utf8'));
  const uflat = JSON.stringify(uplan);
  const uNames = uplan.classes.map(c => c.name);
  const containerClasses = new Set([uplan.tree.styleNames[0], ...(uplan.tree.children || []).filter(c => c.type === 'DivBlock').map(c => c.styleNames[0])]);

  // A hashed / build-generated reference must never leak its names into the client's site.
  const opaque = path.join(tmp, 'op.json');
  fs.writeFileSync(opaque, JSON.stringify({ url: 'https://o.com/', viewport: { width: 1440 }, nodes: [
    { tag: 'header', depth: 0, path: 'header', class: 'css-1a2b3c', box: { x: 0, y: 0, w: 1440, h: 72 }, styles: { display: 'flex' } },
    { tag: 'span', depth: 1, path: 'header>span', class: 'css-9z8y7x', text: 'Brand', box: { x: 32, y: 20, w: 70, h: 28 }, styles: { 'font-size': '18px' } },
    { tag: 'a', depth: 1, path: 'header>a[2]', class: 'sc-bdVaJa hGtqPm', text: 'Docs', box: { x: 420, y: 26, w: 50, h: 20 }, styles: { 'font-size': '14px' } },
  ] }));
  const op = path.join(tmp, 'o.plan.json');
  run([opaque, '--prefix=site-header', '--out-plan=' + op, '--out-contract=' + path.join(tmp, 'o.c.json')]);
  const oflat = fs.readFileSync(op, 'utf8');

  const more = [
    ['utility reference: containers do NOT collapse into one class', containerClasses.size, 3],
    ['utility reference: no utility token becomes a class name', /__(flex|text-sm|px-10|gap-8|rounded-lg)\b/.test(uflat), false],
    ['utility reference: names are roles', uNames.some(n => /__(row|col|group|link|title|nav)/.test(n)), true],
    ['hashed reference: no build-generated name leaks through', /css-1a2b3c|sc-bdvaja|hgtqpm/i.test(oflat), false],
    ['hashed reference: still produces readable role names', /__(row|title|link|nav)/.test(oflat), true],
    ['naming style is detected and reported, not assumed', /reference naming/.test(run([util, '--prefix=x', '--out-plan=' + path.join(tmp, 'x.json'), '--out-contract=' + path.join(tmp, 'xc.json')]).out), true],
  ];
  for (const [name, got, want] of more) { const pass = got === want; ok = ok && pass; console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}` + (pass ? '' : `  (got ${JSON.stringify(got)}, want ${JSON.stringify(want)})`)) }

  try { fs.rmSync(tmp, { recursive: true, force: true }) } catch (e) {}
  process.exit(ok ? 0 : 1);
}

if (has('self-test')) selfTest(); else compile();
