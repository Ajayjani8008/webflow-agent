// native-props.js — is this property/value expressible in Webflow's NATIVE style panel?
//
// Why this file exists: data_style_tool accepts any CSS, but anything the Designer has no field for
// is stored as a CUSTOM PROPERTY. It still emits CSS, so pixel scores, dom-contract property
// equality and a11y all pass — while the build is not Webflow-native and the client cannot edit it.
// Verified 2026-08-23: a font stack and a clamp() font-size shipped that way through every gate.
//
// Site-agnostic by construction: this module knows about Webflow, never about a project.
//
// usage:  const np = require('./native-props');  np.checkClass(name, properties) -> findings[]
//         node native-props.js --self-test
const fs = require('fs'); const path = require('path');
const T = JSON.parse(fs.readFileSync(path.join(__dirname, 'native-props.json'), 'utf8'));

const FN_BLOCK = T.valueFunctions.block;
const FN_WARN = T.valueFunctions.warnOnly;
const NO_CONTROL = new Set(T.propertiesWithoutNativeControl.block);

const fnUsed = (v, list) => { const s = String(v).toLowerCase();
  return list.find(f => { const i = s.indexOf(f + '('); if (i < 0) return false;
    const prev = i === 0 ? '' : s[i - 1]; return !/[a-z0-9_-]/.test(prev); }); };

// A font-family value is native only when it names ONE family (no comma-separated fallback stack).
function fontFamilyFindings(cls, value, installed) {
  const out = [];
  const raw = String(value).trim();
  if (raw.includes(',')) {
    out.push({ level: 'block', rule: 'custom-property-leak', where: `class ${cls} font-family`,
      msg: `"${raw}" is a CSS fallback stack, not a Webflow font — it lands in the Designer's Custom Properties panel and the fallback face renders instead of the intended one`,
      fix: T.propertyRules['font-family'].fix });
    return out;
  }
  if (Array.isArray(installed) && installed.length) {
    const known = installed.map(f => String(f).toLowerCase().trim());
    if (!known.includes(raw.toLowerCase())) {
      out.push({ level: 'block', rule: 'font-not-on-site', where: `class ${cls} font-family`,
        msg: `"${raw}" is not installed on this site (${installed.length} available: ${installed.slice(0, 6).join(', ')}${installed.length > 6 ? ', …' : ''})`,
        fix: 'STOP and hand this to the user: Site Settings > Fonts, add the family, then re-run. Never substitute a near-miss face silently — every glyph advance changes and the section can never reach the pixel floor.' });
    }
  }
  return out;
}

function checkClass(cls, properties, opts) {
  const o = opts || {};
  const props = properties || {};
  const out = [];
  for (const [k, vRaw] of Object.entries(props)) {
    const v = String(vRaw);
    const prop = k.toLowerCase();

    if (NO_CONTROL.has(prop)) {
      out.push({ level: 'block', rule: 'custom-property-leak', where: `class ${cls} ${prop}`,
        msg: `${prop} has no field in the Webflow style panel — this write lands in Custom Properties, not a native control`,
        fix: T.propertiesWithoutNativeControl.fix });
      continue;
    }
    const bad = fnUsed(v, FN_BLOCK);
    if (bad) {
      out.push({ level: 'block', rule: 'custom-property-leak', where: `class ${cls} ${prop}`,
        msg: `${prop}: ${v} uses ${bad}() — Webflow's size fields take one value + one unit, so this lands in Custom Properties`,
        fix: T.valueFunctions.fix });
      continue;
    }
    const soft = fnUsed(v, FN_WARN);
    if (soft) {
      out.push({ level: 'warn', rule: 'value-function', where: `class ${cls} ${prop}`,
        msg: `${prop}: ${v} uses ${soft}() — may land in Custom Properties depending on the field`,
        fix: T.valueFunctions.warnWhy });
    }
    if (prop === 'font-family') out.push(...fontFamilyFindings(cls, v, o.installedFonts));
    if (prop === 'font-weight' && !/^\d{3}$|^(normal|bold|inherit)$/.test(v.trim())) {
      out.push({ level: 'warn', rule: 'font-weight-nonnumeric', where: `class ${cls} font-weight`,
        msg: `font-weight: ${v} — Webflow lists the weights the installed family actually ships`,
        fix: 'use a numeric weight the family carries; a weight it does not carry is browser-synthesised and never matches the reference' });
    }
  }
  return out;
}

function checkPlan(plan, opts) {
  const out = [];
  for (const c of (plan.classes || [])) out.push(...checkClass(c.name, c.properties, opts));
  return out;
}

module.exports = { checkClass, checkPlan, table: T };

if (require.main === module) {
  if (!process.argv.includes('--self-test')) {
    console.log('usage: node native-props.js --self-test    (library: require("./native-props"))');
    process.exit(0);
  }
  const cases = [
    ['clamp font-size blocked', checkClass('x', { 'font-size': 'clamp(3rem, 9.6vw, 120px)' }).some(f => f.level === 'block')],
    ['font stack blocked', checkClass('x', { 'font-family': 'Inter, Arial, sans-serif' }).some(f => f.level === 'block')],
    ['single installed family clean', checkClass('x', { 'font-family': 'Inter' }, { installedFonts: ['Inter'] }).length === 0],
    ['single missing family blocked', checkClass('x', { 'font-family': 'Neue Mono' }, { installedFonts: ['Inter'] }).some(f => f.rule === 'font-not-on-site')],
    ['aspect-ratio blocked', checkClass('x', { 'aspect-ratio': '4 / 5' }).some(f => f.level === 'block')],
    ['inset blocked', checkClass('x', { inset: '0' }).some(f => f.level === 'block')],
    ['px size clean', checkClass('x', { 'font-size': '120px', width: '100%' }).length === 0],
    ['calc warns not blocks', (() => { const f = checkClass('x', { width: 'calc(100% - 20px)' }); return f.length === 1 && f[0].level === 'warn' })()],
    ['cubic-bezier not flagged', checkClass('x', { 'transition-timing-function': 'cubic-bezier(.22,1,.36,1)' }).length === 0],
    ['transform translate not flagged', checkClass('x', { transform: 'translate(-5px, 10px)' }).length === 0],
    ['max-width px clean', checkClass('x', { 'max-width': '331.25px' }).length === 0],
  ];
  let bad = 0;
  for (const [name, ok] of cases) { if (!ok) { bad++; console.log('  FAIL  ' + name) } }
  console.log(bad ? `EVIDENCE native-props self-test — FAIL ${bad}/${cases.length}` : `EVIDENCE native-props self-test — OK ${cases.length} case(s)`);
  process.exit(bad ? 1 : 0);
}
