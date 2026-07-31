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
//   node wf-preflight.js <plan.json> [--json]
//   node wf-preflight.js --self-test
//
// Exit 0 clean · 1 blockers found · 2 usage/IO error.
//
// Plan shape (only what you know at plan time — every field optional except type):
//   { "section": "kush-hero",
//     "classes": [ { "name": "kush-hero", "properties": {"position":"relative"} },
//                  { "name": "kush-hero__wave--1", "parentStyleNames": ["kush-hero__wave"],
//                    "properties": {"width":"1683px"} } ],
//     "tree": { "type": "Section", "styleNames": ["kush-hero"], "children": [
//                 { "type": "TextBlock", "setText": "hi" } ] } }
const fs = require('fs'); const path = require('path');
const argv = process.argv.slice(2);
const JSONOUT = argv.includes('--json');
const SELFTEST = argv.includes('--self-test');
const SK = JSON.parse(fs.readFileSync(path.join(__dirname, 'skeletons.json'), 'utf8'));

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

function check(plan) {
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
    const kids = node.children || [];
    kids.forEach((k, i) => walk(k, `${pathStr}${t}[${i}].`, ancestors.concat(t === 'Form' ? ['Form', 'FormWrapper'] : [t])));
  };
  if (plan.tree) walk(plan.tree, '', []);

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
  console.log('\nself-test:');
  console.log('  expected blocker kinds present: ' + (missing.length ? 'MISSING ' + missing.join(',') : 'all ' + want.join(', ')));
  console.log('  FormSelect flagged once (outside Form) and NOT flagged inside Form: ' + (selectInForm === 1 ? 'ok' : 'FAIL (' + selectInForm + ')'));
  process.exit(missing.length === 0 && selectInForm === 1 ? 0 : 1);
}

const file = argv.filter(a => !a.startsWith('--'))[0];
if (!file) { console.error('usage: node wf-preflight.js <plan.json> [--json]   |   --self-test'); process.exit(2) }
if (!fs.existsSync(file)) { console.error('ERR plan not found: ' + file); process.exit(2) }
const r = check(JSON.parse(fs.readFileSync(file, 'utf8')));
report(r);
process.exit(r.blockers.length ? 1 : 0);
