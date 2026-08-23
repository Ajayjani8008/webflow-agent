// wf-preflight.js — validate a PLANNED Webflow build before spending a single MCP call.
//
// Why this exists: every failure in the 2026-07-31 build session was knowable in advance, yet each
// one was discovered by hitting it — costing rework calls, publishes and tokens:
//   · a BEM modifier applied as [base, modifier] when the modifier was a plain global class, not a
//     real combo  -> "One or more styles not found", 3 wasted calls
//   · set_text on a TextBlock (which is really a Block) -> silently ignored / "doesn't support text"
//   · FormSelect placed outside a Form -> `MPS rejected update`, WHOLE batch rolled back
//   · Navbar requested -> not in the type enum at all
//   · Dropdown/Tabs/Form/CMS/RichText skeletons shipping placeholder copy -> Rule 14 content-gate fail
//   · CSS shorthands (gap, border-radius, padding) -> land in Custom Properties instead of native controls
// Prose in error_learnings does not prevent any of this: the next person has to have read it.
// Code does. This is that code.
//
// Usage:
//   node wf-preflight.js <plan.json> [--json] [--site-prefix=<id>] [--known-prefixes=a,b,c]
//        --site-prefix / --known-prefixes let it reject a block prefix that belongs to neither the
//        site nor an existing registry convention. A header + hero once shipped 48 classes prefixed
//        with the FIGMA FILE NAME ("example-") onto a site called example-site-design; the rules said
//        "BEM kebab-case" and never said where the block name comes from, so the filename filled it.
//   node wf-preflight.js --self-test
//
// Exit 0 clean · 1 blockers found · 2 usage/IO error.
//
// Plan shape (only what you know at plan time — every field optional except type):
//   { "section": "example-hero",
//     "classes": [ { "name": "example-hero", "properties": {"position":"relative"} },
//                  { "name": "example-hero__wave--1", "parentStyleNames": ["example-hero__wave"],
//                    "properties": {"width":"1683px"} } ],
//     "tree": { "type": "Section", "styleNames": ["example-hero"], "children": [
//                 { "type": "TextBlock", "setText": "hi" } ] } }
const fs = require('fs'); const path = require('path');
const argv = process.argv.slice(2);
const JSONOUT = argv.includes('--json');
const SELFTEST = argv.includes('--self-test');
// Installed site fonts, supplied by the caller — never hardcoded here (the pack stays site-agnostic).
// --fonts=a,b,c   or   --fonts=<path to a json array / {"fonts":[...]}>
let INSTALLED_FONTS = null;
const argvOpt = n => { const p = '--' + n + '='; const a = argv.find(x => x.startsWith(p)); return a ? a.slice(p.length) : null; };
(() => {
  const raw = (() => { const pfx = '--fonts='; const a = argv.find(x => x.startsWith(pfx)); return a ? a.slice(pfx.length) : null })();
  if (!raw) return;
  try {
    if (fs.existsSync(raw)) { const j = JSON.parse(fs.readFileSync(raw, 'utf8')); INSTALLED_FONTS = Array.isArray(j) ? j : (j.fonts || null) }
    else INSTALLED_FONTS = raw.split(',').map(x => x.trim()).filter(Boolean);
  } catch (e) { INSTALLED_FONTS = null }
})();
const SK = JSON.parse(fs.readFileSync(path.join(__dirname, 'skeletons.json'), 'utf8'));
const NATIVE = require('./native-props');   // Invariant 5, machine-checkable

// CSS shorthands that must be expanded to longhand, and what they expand to.
const SHORTHANDS = {
  'gap': ['grid-row-gap', 'grid-column-gap'],
  'grid-gap': ['grid-row-gap', 'grid-column-gap'],
  'padding': ['padding-top', 'padding-right', 'padding-bottom', 'padding-left'],
  'margin': ['margin-top', 'margin-right', 'margin-bottom', 'margin-left'],
  'border-radius': ['border-top-left-radius', 'border-top-right-radius', 'border-bottom-left-radius', 'border-bottom-right-radius'],
  'border': ['border-style', 'border-width', 'border-color'],
  'background': ['background-color', 'background-image'],
  'font': ['font-family', 'font-size', 'font-weight', 'line-height'],
  'flex': ['flex-grow', 'flex-shrink', 'flex-basis'],
  'transition': ['transition-property', 'transition-duration', 'transition-timing-function'],
  'inset': ['top', 'right', 'bottom', 'left'],
  'place-items': ['align-items', 'justify-items'],
  'overflow': null   // overflow is accepted natively by Webflow; listed so it is never flagged
};
const VALID_TYPES = new Set(['Container', 'Section', 'DivBlock', 'Heading', 'TextBlock', 'Paragraph', 'Button',
  'TextLink', 'LinkBlock', 'Image', 'RichText', 'CodeBlock', 'Blockquote', 'HtmlEmbed', 'Video', 'YouTubeVideo',
  'Lightbox', 'Form', 'FormBlockLabel', 'FormTextInput', 'FormTextarea', 'FormCheckboxInput', 'FormRadioInput',
  'FormSelect', 'FormFileUploadWrapper', 'FormButton', 'Tabs', 'Slider', 'CMSCollection', 'PageSlot',
  'ComponentSlot', 'Dropdown', 'DOM', 'BY_CUSTOM_TAG']);

// ── v2.0 ban-sweep constants: the Never-list clauses a machine can decide ──────────────────────
// Every entry below used to be a sentence the agent had to remember at turn 200 under a 500k
// context. A sentence forgets; a regex does not.
const PLACEHOLDER_RE = new RegExp([
  'lorem ipsum', 'this is some text inside of a div block', '^text$', '^heading$', '^button$',
  '^paragraph$', '^title$', '^subtitle$', '^label$', '^link$', '^click here$', '^learn more later$',
  'placeholder', '^tab (one|two|three)$', '^slide \\d+$', '^item \\d+$', '^your (text|heading) here$',
  '^insert', 'sample text', '^tbd$', '^todo$', '^xxx+$', '^\\.{3,}$', '^dummy',
].join('|'), 'i');
const CODE_TYPES = new Set(['HtmlEmbed', 'CodeBlock', 'DOM']);
const XATTR_OK = /^(id|href|target|rel|alt|title|type|name|value|placeholder|role|tabindex|lang|dir|loading|decoding|src|srcset|sizes|width|height|for|action|method|autocomplete|required|disabled|checked|selected|multiple|maxlength|min|max|step|pattern|aria-[\w-]+|data-[\w-]+)$/i;
const IMITABLE_TYPES = new Set(['DivBlock', 'Container', 'Section', 'LinkBlock']);
const IMITATION_RE = {
  Slider: /\b[\w-]*(slider|carousel|slideshow)[\w-]*\b/,
  Tabs: /\b[\w-]*(tabs?[-_]?(nav|menu|pane|link|content)|tabpanel)[\w-]*\b/,
  Dropdown: /\b[\w-]*(dropdown|accordion|disclosure)[\w-]*\b/,
  Navbar: /\b[\w-]*(navbar|nav[-_]?bar)[\w-]*\b/,
  Lightbox: /\b[\w-]*(lightbox|gallery[-_]?modal)[\w-]*\b/,
  Form: /\b[\w-]*(form[-_]?(wrapper|block))[\w-]*\b/,
};
// intrinsic UI keeps bare px widths; everything else is fluid-first (Rule 7)
const INTRINSIC_RE = /(icon|avatar|logo|badge|dot|bullet|chevron|arrow|thumb|swatch|divider|rule|spinner|check)/i;
const BEM_RE = /^[a-z0-9]+(-[a-z0-9]+)*(__[a-z0-9]+(-[a-z0-9]+)*)?(--[a-z0-9]+(-[a-z0-9]+)*)?$/;
// A class's block segment is everything before the first __ ; its prefix is the first hyphen group.
const blockOf = n => String(n).split('__')[0];

function check(plan, o) {
  o = o || {};
  const blockers = [], warnings = [];
  const B = (kind, where, msg, fix) => blockers.push({ kind, where, msg, fix });
  const W = (kind, where, msg, fix) => warnings.push({ kind, where, msg, fix });

  // ---------- classes ----------
  const classes = plan.classes || [];
  const byName = new Map(classes.map(c => [c.name, c]));
  const comboDeclared = new Set(classes.filter(c => (c.parentStyleNames || []).length).map(c => c.name));
  for (const c of classes) {
    for (const p of Object.keys(c.properties || {})) {
      const lp = p.toLowerCase();
      if (Object.prototype.hasOwnProperty.call(SHORTHANDS, lp) && SHORTHANDS[lp]) {
        B('css-shorthand', `class ${c.name}`,
          `"${p}" is a CSS shorthand — data_style_tool puts shorthands in the Custom Properties panel, not native controls, so the value is void`,
          `expand to: ${SHORTHANDS[lp].join(' + ')}`);
      }
    }
    if (/--/.test(c.name) && !(c.parentStyleNames || []).length) {
      W('modifier-not-combo', `class ${c.name}`,
        'a "--modifier" class with no parentStyleNames will be created as a plain GLOBAL class',
        'if any element applies it together with its base, declare parentStyleNames:["<base>"] so it is created as a real combo — otherwise style application fails with "One or more styles not found"');
    }
  }

  // ---------- tree ----------
  const walk = (node, pathStr, ancestors) => {
    if (!node || typeof node !== 'object') return;
    const t = node.type;
    const where = `${pathStr}<${t || '?'}>`;
    if (!t) { B('missing-type', where, 'element has no type', 'every element_schema needs a type'); return }
    if (!VALID_TYPES.has(t)) {
      const mod = SK.modules[t];
      if (mod && mod.available === false) {
        B('type-unavailable', where, `${t} is NOT in the data_element_builder type enum — ${mod.notes.split('.')[0]}`,
          'build the closest native structure and log the gap to impossible_cases.md; do not silently ship a div imitation without recording why');
      } else {
        B('type-invalid', where, `"${t}" is not a valid element_schema type`,
          'pick from the enum (Section, DivBlock, Paragraph, Heading, Image, LinkBlock, Slider, Tabs, Dropdown, Form, Lightbox, CMSCollection, ...)');
      }
    }
    const mod = SK.modules[t];

    // set_text safety
    if (node.setText != null) {
      if (SK.setTextUnsafeTypes.includes(t) || (mod && mod.setTextOnCreate === false)) {
        B('set-text-ignored', where,
          `set_text on ${t} is silently ignored — ${t} is created as "${(mod && mod.createdType) || 'Block'}", which does not own its text node`,
          `use one of: ${SK.setTextSafeTypes.join(', ')}`);
      }
    }
    // placement constraints
    if (mod && mod.placementConstraint) {
      if (!ancestors.includes(mod.placementConstraint)) {
        B('invalid-placement', where,
          `${t} must live inside a ${mod.placementConstraint} subtree — placing it elsewhere returns "MPS rejected update" and ROLLS BACK THE WHOLE BATCH`,
          `nest it under a ${mod.placementConstraint}, or create it in a separate call`);
      }
    }
    // auto-skeleton placeholders
    if (mod && (mod.placeholders || []).length) {
      W('skeleton-placeholders', where,
        `${t} is created as ${mod.createdType} and arrives WITH placeholder content: ${mod.placeholders.slice(0, 4).map(s => JSON.stringify(s)).join(', ')}${mod.placeholders.length > 4 ? ` (+${mod.placeholders.length - 4} more)` : ''}`,
        'plan the cleanup in the same pass: replace with real content or remove the nodes. Any survivor fails the Rule 14 content gate — grep the published HTML before calling the section done');
    }
    if (mod && (mod.iconFontChildren || []).length) {
      W('icon-font-child', where,
        `${t} generates Webflow ICON-FONT ${mod.iconFontChildren.join('/')} children which cannot take an image asset`,
        'hide them with a display:none class and append your own Image if the design supplies its own art');
    }
    if (mod && mod.defaults) {
      W('skeleton-defaults', where, `${t} default counts: ${JSON.stringify(mod.defaults)}`,
        'if the design needs more, append the extra children explicitly — the skeleton will not grow on its own');
    }

    // combo application
    const sn = node.styleNames || [];
    if (sn.length > 1) {
      for (const name of sn.slice(1)) {
        if (!comboDeclared.has(name)) {
          B('combo-not-declared', where,
            `applies [${sn.join(', ')}] but "${name}" is not declared as a combo class`,
            `create it with parentStyleNames:["${sn[0]}"] first — otherwise BOTH element_builder and element_tool set_style reject the pair with "One or more styles not found: ${sn.join(', ')}", even though both classes exist`);
        }
      }
    }
    for (const name of sn) {
      if (classes.length && !byName.has(name)) {
        W('style-undeclared', where, `applies "${name}" which is not in plan.classes`,
          'create the class before applying it, or the element is created unstyled (a partial_success that is easy to misread as total failure)');
      }
    }
    // ---- v2.0 ban-sweep: the Never-list clauses a machine can decide ----------------------
    // Rule 14 — placeholder / invented copy never ships.
    if (typeof node.setText === 'string' && PLACEHOLDER_RE.test(node.setText.trim())) {
      B('placeholder-copy', where, `setText is placeholder copy: ${JSON.stringify(node.setText.slice(0, 60))}`,
        'use the verbatim string from the source. Rule 14 is a hard gate — pixel-verify §1.5 fails the section on any survivor');
    }
    // Rule 4 — code is never the agent's call.
    if (CODE_TYPES.has(t) && !node.authorization) {
      B('code-without-authorization', where,
        `${t} is a code element with no "authorization" field — code needs a written T1/T2/T3 descent proof AND an explicit per-effect user yes`,
        'descend the ladder first (T1 class style -> T2 real child element -> T3 native Interactions). If the effect is genuinely in the T4 canvas/WebGL set, ask the user in one line and record their exact words as authorization:"<quote> (YYYY-MM-DD)"');
    }
    // Rule 4 — no CSS through attributes; xattr is HTML semantics only.
    for (const a of (node.xattr || node.attributes || [])) {
      const an = (a && (a.name || a.key) || '').toLowerCase();
      if (an === 'style') B('style-attribute', where, 'inline style attribute', 'every CSS value goes through data_style_tool on a class');
      else if (an && !XATTR_OK.test(an)) W('xattr-suspect', where, `xattr "${an}" is not a known HTML semantic attribute`,
        'xattr is for id/href/alt/type/placeholder/role/aria-*/data-*/CMS bindings only — CSS there is void');
    }
    // Rule 4 — a div-imitation of a module the platform already ships.
    if (IMITABLE_TYPES.has(t)) {
      const names = (node.styleNames || []).join(' ').toLowerCase();
      for (const [native, re] of Object.entries(IMITATION_RE)) {
        if (re.test(names)) {
          B('div-imitation', where, `class names (${names.trim()}) describe a ${native}, but this is a ${t}`,
            `build the native ${native} element. A div-imitation of an existing native module is a ban-sweep FAIL — if the native one genuinely cannot be created via MCP, log it to impossible_cases.md and say so in the report`);
          break;
        }
      }
    }
    // Rule 15 — an icon in a flex row without flex-shrink:0 collapses to 0 wide.
    if (t === 'Image') {
      const own = (node.styleNames || []).map(n => byName.get(n)).filter(Boolean);
      const props = Object.assign({}, ...own.map(c => c.properties || {}));
      const parentFlex = ancestors.length && flexParents.has(ancestors[ancestors.length - 1] + '|' + pathStr);
      if (parentFlex && String(props['flex-shrink']) !== '0') {
        B('icon-no-flex-shrink', where, 'Image inside a flex row without flex-shrink:0 — this is how icons ship at 0 wide',
          'add flex-shrink:0 plus an explicit width and height to the icon class, then verify the rendered box is non-zero at every breakpoint');
      }
    }

    const kids = node.children || [];
    // remember which children sit inside a flex parent, for the icon check above
    const selfProps = Object.assign({}, ...(node.styleNames || []).map(n => (byName.get(n) || {}).properties || {}));
    if (/^(flex|inline-flex)$/.test(String(selfProps.display || ''))) {
      kids.forEach((k, i) => flexParents.add(t + '|' + `${pathStr}${t}[${i}].`));
    }
    kids.forEach((k, i) => walk(k, `${pathStr}${t}[${i}].`, ancestors.concat(t === 'Form' ? ['Form', 'FormWrapper'] : [t])));
  };
  const flexParents = new Set();
  if (plan.tree) walk(plan.tree, '', []);

  // ---------- class-level ban sweep (v2.0) ----------
  const seen = new Set();
  for (const c of classes) {
    if (seen.has(c.name)) B('duplicate-class', `class ${c.name}`, 'declared twice in this plan',
      'one declaration per class — duplicates create a second global class and split the styling');
    seen.add(c.name);

    const p = c.properties || {};
    // Rule 7 — fluid base first. A bare px width on a layout class is a Figma canvas artifact.
    const w = String(p.width || '');
    // a small square (width == height, <=64px) is intrinsic UI whatever it is called
    const sq = w && String(p.height || '') === w && parseFloat(w) <= 64;
    if (/^\d+(\.\d+)?px$/.test(w) && !INTRINSIC_RE.test(c.name) && !sq && !p['max-width']) {
      W('bare-px-width', `class ${c.name}`, `width:${w} with no max-width — Figma fixed widths are canvas artifacts, not responsive intent`,
        'use width:100% + max-width:' + w + '. Bare px belongs only on intrinsic UI (icon, avatar, logo, fixed media)');
    }
    // partial radius is legal but usually a transcription slip
    const corners = ['border-top-left-radius', 'border-top-right-radius', 'border-bottom-left-radius', 'border-bottom-right-radius'];
    const have = corners.filter(k => p[k] !== undefined);
    if (have.length && have.length < 4) {
      W('partial-radius', `class ${c.name}`, `only ${have.length}/4 radius corners set`,
        'set all four longhands unless the design really has asymmetric corners — a missing corner is the most common shorthand-expansion slip');
    }
    // ---- Invariant 5, enforced: is every value expressible in Webflow's NATIVE style panel? ----
    // A value the Designer has no field for is stored as a CUSTOM PROPERTY. It still emits CSS, so
    // every pixel/property gate passes while the build is not native and the client cannot edit it.
    for (const f of NATIVE.checkClass(c.name, p, { installedFonts: INSTALLED_FONTS })) {
      (f.level === 'block' ? B : W)(f.rule, f.where, f.msg, f.fix);
    }
    if (!BEM_RE.test(c.name)) W('class-naming', `class ${c.name}`, 'not BEM kebab-case',
      'block, block__element, block__element--modifier — keeps the registry dedupable');
  }

  // ---- FIX 4: the block prefix must belong to the site, not to the source file ----
  const sitePrefix = String(o.sitePrefix != null ? o.sitePrefix : (argvOpt('site-prefix') || '')).toLowerCase();
  const known = String(o.known != null ? o.known : (argvOpt('known-prefixes') || '')).toLowerCase().split(',').map(x => x.trim()).filter(Boolean);
  if (sitePrefix || known.length) {
    const allowed = new Set(known);
    if (sitePrefix) {
      allowed.add(sitePrefix);
      // a site id like "example-site-design" legitimately abbreviates to its initials, "esd"
      // a site id like "example-site-design" legitimately abbreviates to any leading run of its
      // initials: es, esd. Accept those, plus any whole word of 3+ chars. A prefix taken from the
      // SOURCE FILE name rather than the site matches none of them, which is the point.
      const initials = sitePrefix.split('-').filter(Boolean).map(w => w[0]).join('');
      for (let i = 2; i <= initials.length; i++) allowed.add(initials.slice(0, i));
      sitePrefix.split('-').forEach(w => { if (w.length >= 3) allowed.add(w); });
    }
    const blocks = [...new Set(classes.map(c => blockOf(c.name)))];
    const orphans = blocks.filter(b => ![...allowed].some(a => b === a || b.startsWith(a + '-')));
    if (orphans.length) {
      B('block-prefix-foreign', 'classes ' + orphans.slice(0, 4).join(', ') + (orphans.length > 4 ? ' (+' + (orphans.length - 4) + ')' : ''),
        'block prefix belongs to neither the site (' + (sitePrefix || '-') + ') nor a known registry prefix (' + (known.join(', ') || 'none') + ')',
        'derive the prefix from build_state.site.id or the section role, and grep registry.md for what this site already uses. A Figma file name, page name or cache key is an accident of where the design lived — renaming the file must not strand the class system.');
    }
  }

  return { section: plan.section || null, blockers, warnings };
}

function report(r) {
  if (JSONOUT) { console.log(JSON.stringify(r, null, 1)); return }
  const v = r.blockers.length ? 'BLOCKED' : (r.warnings.length ? 'PASS-WITH-NOTES' : 'CLEAN');
  console.log(`EVIDENCE wf-preflight — ${v}   ${r.section || '(plan)'}   ${r.blockers.length} blocker(s), ${r.warnings.length} note(s)`);
  for (const b of r.blockers) { console.log(`  BLOCKER ${b.kind}  ${b.where}\n     ${b.msg}\n     fix: ${b.fix}`) }
  for (const w of r.warnings) { console.log(`  note ${w.kind}  ${w.where}\n     ${w.msg}\n     do: ${w.fix}`) }
  if (v === 'CLEAN') console.log('  no known MCP trap in this plan');
}

if (SELFTEST) {
  const bad = {
    section: 'self-test',
    classes: [
      { name: 'a', properties: { gap: '10px', 'border-radius': '8px', position: 'relative' } },
      { name: 'a--mod', properties: { width: '10px' } }
    ],
    tree: {
      type: 'Section', styleNames: ['a'], children: [
        { type: 'TextBlock', setText: 'ignored' },
        { type: 'Navbar' },
        { type: 'FormSelect' },
        { type: 'Dropdown' },
        { type: 'RichText' },
        { type: 'DivBlock', styleNames: ['a', 'a--mod'] },
        { type: 'Nope' },
        { type: 'Form', children: [{ type: 'FormSelect' }] }
      ]
    }
  };
  const r = check(bad);
  const kinds = r.blockers.map(b => b.kind);
  const want = ['css-shorthand', 'set-text-ignored', 'type-unavailable', 'invalid-placement', 'combo-not-declared', 'type-invalid'];
  const missing = want.filter(k => !kinds.includes(k));
  const selectInForm = r.blockers.filter(b => b.kind === 'invalid-placement').length;
  report(r);

  // ---- v2.0 ban-sweep cases ----
  const ban = {
    section: 'ban-sweep',
    classes: [
      { name: 'hero', properties: { color: '#111' } },
      { name: 'hero', properties: { color: '#000' } },                                  // duplicate-class
      { name: 'hero__row', properties: { display: 'flex' } },                           // flex parent
      { name: 'hero__icon', properties: { width: '24px', height: '24px' } },            // icon, no flex-shrink
      { name: 'hero__card', properties: { width: '480px' } },                           // bare-px-width
      { name: 'hero__box', properties: { 'border-top-left-radius': '8px' } },           // partial-radius
      { name: 'Hero_Box', properties: { color: '#111' } },                              // class-naming
      { name: 'hero__slider-track', properties: {} },
      // Invariant 5: values Webflow's native style panel cannot express -> they land in Custom Properties
      { name: 'hero__leak', properties: { 'font-size': 'clamp(3rem, 9.6vw, 120px)', 'font-family': 'Inter, Arial, sans-serif', 'aspect-ratio': '4 / 5' } },
      { name: 'hero__native', properties: { 'font-size': '120px', 'font-family': 'Inter', width: '100%', 'max-width': '331px' } },
    ],
    tree: {
      type: 'Section', styleNames: ['hero'], children: [
        { type: 'Paragraph', setText: 'Lorem ipsum dolor sit amet' },                   // placeholder-copy
        { type: 'Paragraph', setText: 'This is some text inside of a div block.' },     // placeholder-copy
        { type: 'Paragraph', setText: 'Experience premium perfumes from Dubai.' },      // real copy, must NOT fire
        { type: 'HtmlEmbed' },                                                          // code-without-authorization
        { type: 'HtmlEmbed', authorization: 'user said yes 2026-08-01' },               // authorized, must NOT fire
        { type: 'DivBlock', styleNames: ['hero__row'], children: [
          { type: 'Image', styleNames: ['hero__icon'] },                                // icon-no-flex-shrink
        ] },
        { type: 'DivBlock', styleNames: ['hero__slider-track'] },                       // div-imitation (Slider)
        { type: 'DivBlock', xattr: [{ name: 'style', value: 'color:red' }] },           // style-attribute
        { type: 'DivBlock', xattr: [{ name: 'aria-label', value: 'ok' }] },             // must NOT fire
      ]
    }
  };
  const r2 = check(ban);
  const k2 = r2.blockers.map(b => b.kind), w2 = r2.warnings.map(x => x.kind);
  const cases = [
    ['placeholder-copy fires twice, real copy clean', k2.filter(k => k === 'placeholder-copy').length === 2],
    ['code-without-authorization fires once only', k2.filter(k => k === 'code-without-authorization').length === 1],
    ['div-imitation caught by class name', k2.includes('div-imitation')],
    ['icon in flex row without flex-shrink blocked', k2.includes('icon-no-flex-shrink')],
    ['inline style attribute blocked', k2.includes('style-attribute')],
    ['aria-* attribute not flagged', !w2.includes('xattr-suspect')],
    ['duplicate class blocked', k2.includes('duplicate-class')],
    ['bare px width warned', w2.includes('bare-px-width')],
    ['partial radius warned', w2.includes('partial-radius')],
    ['non-BEM name warned', w2.includes('class-naming')],
    ['custom-property leak blocked (clamp / font stack / aspect-ratio)', k2.filter(k => k === 'custom-property-leak').length === 3],
    ['native px + single installed-family value stays clean', !k2.includes('font-not-on-site')],
  ];
  console.log('\nself-test:');
  console.log('  expected blocker kinds present: ' + (missing.length ? 'MISSING ' + missing.join(',') : 'all ' + want.join(', ')));
  console.log('  FormSelect flagged once (outside Form) and NOT flagged inside Form: ' + (selectInForm === 1 ? 'ok' : 'FAIL (' + selectInForm + ')'));
  // FIX 4: a block prefix from the SOURCE FILE must be blocked; the site's own initials must pass.
  const prefixPlan = p => ({ section: 'x', classes: [{ name: p, properties: { color: '#000' } }, { name: p + '__row', properties: {} }], tree: { type: 'Section', styleNames: [p] } });
  const withArgs = (plan, site, known) => check(plan, { sitePrefix: site, known }).blockers.map(b => b.kind);
  cases.push(['foreign prefix blocked (a prefix taken from the SOURCE FILE name)', withArgs(prefixPlan('srcfile-nav'), 'example-site-design', 'hc,ns').includes('block-prefix-foreign')]);
  cases.push(['site initials accepted (esd)', !withArgs(prefixPlan('esd-nav'), 'example-site-design', 'hc,ns').includes('block-prefix-foreign')]);
  cases.push(['existing registry prefix accepted (hc)', !withArgs(prefixPlan('hc-hero'), 'example-site-design', 'hc,ns').includes('block-prefix-foreign')]);
  cases.push(['no site-prefix given = check disabled', !withArgs(prefixPlan('srcfile-nav'), '', '').includes('block-prefix-foreign')]);

  let banOk = true;
  for (const [name, ok] of cases) { console.log('  ' + (ok ? 'ok  ' : 'FAIL') + '  ' + name); banOk = banOk && ok; }
  process.exit(missing.length === 0 && selectInForm === 1 && banOk ? 0 : 1);
}

const file = argv.filter(a => !a.startsWith('--'))[0];
if (!file) { console.error('usage: node wf-preflight.js <plan.json> [--json]   |   --self-test'); process.exit(2) }
if (!fs.existsSync(file)) { console.error('ERR plan not found: ' + file); process.exit(2) }
const r = check(JSON.parse(fs.readFileSync(file, 'utf8')));
report(r);
process.exit(r.blockers.length ? 1 : 0);
