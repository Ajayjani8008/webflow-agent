// wf-plan.js — SOURCE -> COMPLETE PLAN, in one command, before a single Webflow write.
//
// Why this exists. The pack's cost is the LOOP: build -> verify -> discover a rule the reference
// always contained -> fix -> publish -> verify again. Measured on a real page (2026-08-23): three
// sections, 8 publishes, and the two most expensive corrections were both facts sitting in the
// reference the whole time — a mobile rule that hides two of three gallery cards below 767, and
// type sizes that had to be measured per width instead of read off a clamp curve. Neither was a
// judgement call. Both were learned by FAILING a gate, which is the most expensive way to learn.
//
// The rule this script encodes: a checker CONFIRMS, it does not DISCOVER. Anything the verifier can
// find, intake must already know. So intake captures every breakpoint the build will ship, compiles
// each one, and diffs them into base + overrides automatically. The agent then writes once.
//
// Usage:
//   node wf-plan.js <url> <selector> --prefix=<block> --out=<dir> [--widths=1440,991,767,478]
//                   [--fonts=Inter,Eudoxussans] [--port=9600] [--font=<substitute>]
//   node wf-plan.js --self-test
//
// Emits into --out:  <prefix>.plan.json        base classes + per-breakpoint overrides, native-normalized
//                    <prefix>.readiness.json   fonts/assets/blockers that would otherwise surface post-publish
//   stdout: EVIDENCE block — widths captured, classes, overrides per breakpoint, elements the reference
//           HIDES at a width, fonts the site must already have, and every blocker, before any write.
const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const NATIVE = require('./native-props');

const argv = process.argv.slice(2);
const opt = (n, d) => { const p = '--' + n + '='; const a = argv.find(x => x.startsWith(p)); return a ? a.slice(p.length) : d; };
const has = (n) => argv.includes('--' + n);

// Webflow's breakpoint ids, keyed by the width you must CAPTURE to author them honestly.
const BP = [
  { w: 1440, id: 'main' },
  { w: 991, id: 'medium' },
  { w: 767, id: 'small' },
  { w: 478, id: 'tiny' },
];

const runScript = (script, args) => {
  const r = cp.spawnSync(process.execPath, [path.join(__dirname, script), ...args], { encoding: 'utf8', maxBuffer: 1 << 28 });
  return { ok: r.status === 0, out: (r.stdout || '') + (r.stderr || '') };
};

// Two plans, same class name: which properties actually CHANGED at this width?
// Only the delta is authored. Re-writing the full set at every breakpoint is how a build ends up
// with overrides nobody intended and a Designer panel nobody can read.
function overridesFor(basePlan, widthPlan) {
  const baseBy = new Map((basePlan.classes || []).map((c) => [c.name, c.properties || {}]));
  const outs = [];
  for (const c of widthPlan.classes || []) {
    const b = baseBy.get(c.name);
    if (!b) continue;
    const delta = {};
    for (const [k, v] of Object.entries(c.properties || {})) {
      if (String(b[k]) !== String(v)) delta[k] = v;
    }
    if (Object.keys(delta).length) outs.push({ name: c.name, properties: delta });
  }
  // A class present at base and GONE at this width is a display:none rule the reference is stating
  // out loud. This one check is what cost a publish plus two verify runs to learn by hand.
  const widthNames = new Set((widthPlan.classes || []).map((c) => c.name));
  for (const name of baseBy.keys()) {
    if (!widthNames.has(name)) {
      outs.push({ name, properties: { display: 'none' }, _reason: 'absent from the reference at this width' });
    }
  }
  return outs;
}

function readiness(plan, installedFonts) {
  const fonts = new Set();
  const blockers = [];
  let imageSlots = 0;
  const scan = (cls) => {
    for (const [k, v] of Object.entries(cls.properties || {})) {
      if (k === 'font-family') fonts.add(String(v).split(',')[0].replace(/["']/g, '').trim());
    }
  };
  (plan.classes || []).forEach(scan);
  for (const bp of plan.breakpoints || []) (bp.classes || []).forEach(scan);
  const walk = (n) => {
    if (!n) return;
    if (n.set_image_asset || n.type === 'Image') imageSlots++;
    (n.children || []).forEach(walk);
  };
  walk(plan.tree);
  if (Array.isArray(installedFonts) && installedFonts.length) {
    const known = installedFonts.map((f) => f.toLowerCase().trim());
    for (const f of fonts) {
      if (f && !known.includes(f.toLowerCase())) {
        blockers.push({
          kind: 'font-not-on-site',
          what: f,
          fix: 'Site Settings > Fonts must carry this family BEFORE the build writes. A substituted face changes every glyph advance, so the section can never reach the pixel floor and no score can attribute the gap.',
        });
      }
    }
  }
  for (const l of NATIVE.checkPlan(plan, { installedFonts }).filter((f) => f.level === 'block')) {
    blockers.push({ kind: l.rule, what: l.where, fix: l.fix });
  }
  // One line per ROOT CAUSE, not per class. A missing font is ONE decision for the user however many
  // classes reference it; printing it 16 times is the same context waste this script exists to end.
  const merged = new Map();
  for (const b of blockers) {
    const isPerClassFont = b.kind === 'font-not-on-site' && /font-family$/.test(String(b.what));
    const key = isPerClassFont ? 'font-not-on-site|per-class' : b.kind + '|' + b.what;
    const hit = merged.get(key);
    if (hit) { hit.count++; } else { merged.set(key, Object.assign({}, b, { count: 1 })); }
  }
  const out = [...merged.values()].filter((b) => !(b.kind === 'font-not-on-site' && /font-family$/.test(String(b.what))));
  return { fontsRequired: [...fonts], imageSlots, blockers: out };
}

function main() {
  const url = argv[0];
  const selector = argv[1];
  const prefix = opt('prefix');
  const out = opt('out');
  if (!url || !selector || !prefix || !out) {
    console.error('usage: node wf-plan.js <url> <selector> --prefix=<block> --out=<dir> [--widths=] [--fonts=] [--port=]');
    process.exit(2);
  }
  const widths = opt('widths', '1440,991,767,478').split(',').map((x) => parseInt(x, 10)).filter(Boolean);
  const installed = (opt('fonts', '') || '').split(',').map((s) => s.trim()).filter(Boolean);
  let port = parseInt(opt('port', '9600'), 10);
  fs.mkdirSync(out, { recursive: true });

  const perWidth = [];
  const notes = [];
  for (const w of widths) {
    const ex = path.join(out, '_extract-' + w + '.json');
    const r1 = runScript('ref-extract.js', [url, ex, String(w), selector, '0', String(port++)]);
    if (!fs.existsSync(ex)) {
      notes.push('width ' + w + ': capture FAILED — ' + r1.out.trim().split('\n').pop());
      continue;
    }
    const pl = path.join(out, '_plan-' + w + '.json');
    const cargs = [ex, '--prefix=' + prefix, '--out-plan=' + pl];
    if (opt('font')) cargs.push('--font=' + opt('font'));
    const r2 = runScript('url-compile.js', cargs);
    if (!fs.existsSync(pl)) {
      notes.push('width ' + w + ': compile FAILED — ' + r2.out.trim().split('\n').pop());
      continue;
    }
    perWidth.push({ w, plan: JSON.parse(fs.readFileSync(pl, 'utf8')) });
  }
  if (!perWidth.length) {
    console.log('EVIDENCE wf-plan — FAIL   no width compiled\n  ' + notes.join('\n  '));
    process.exit(1);
  }

  const base = perWidth[0];
  const plan = {
    section: prefix,
    source: { url, selector, widths: perWidth.map((p) => p.w) },
    classes: base.plan.classes,
    tree: base.plan.tree,
    breakpoints: [],
  };
  for (const pw of perWidth.slice(1)) {
    const bp = BP.find((b) => b.w === pw.w);
    plan.breakpoints.push({
      width: pw.w,
      breakpoint_id: bp ? bp.id : String(pw.w),
      classes: overridesFor(base.plan, pw.plan),
    });
  }
  const ready = readiness(plan, installed.length ? installed : null);
  fs.writeFileSync(path.join(out, prefix + '.plan.json'), JSON.stringify(plan, null, 1));
  fs.writeFileSync(path.join(out, prefix + '.readiness.json'), JSON.stringify(ready, null, 1));

  const L = [];
  L.push('EVIDENCE wf-plan — ' + (ready.blockers.length ? 'BLOCKED' : 'READY') + '   ' + prefix + '   ' + url + ' [' + selector + ']');
  L.push('  widths captured    ' + perWidth.map((p) => p.w).join(', '));
  L.push('  base classes       ' + (plan.classes || []).length);
  for (const b of plan.breakpoints) {
    const hides = b.classes.filter((c) => c._reason).length;
    L.push('  @' + b.width + ' (' + b.breakpoint_id + ')' + '       ' + b.classes.length + ' override(s)' +
      (hides ? ', ' + hides + ' element(s) the reference HIDES at this width' : ''));
  }
  L.push('  fonts required     ' + (ready.fontsRequired.join(', ') || '(none authored)'));
  if (ready.imageSlots) L.push('  image slots        ' + ready.imageSlots + " — the owner's assets must exist before the build writes, or the section ships grey frames");
  for (const n of notes) L.push('  note               ' + n);
  for (const b of ready.blockers) L.push('  BLOCKER ' + b.kind + '  ' + b.what + (b.count > 1 ? '   (' + b.count + ' classes affected)' : '') + '\n     fix: ' + b.fix);
  if (!ready.blockers.length) L.push('  -> every breakpoint rule is in the plan BEFORE the first write. Build once, then verify to CONFIRM — not to discover.');
  console.log(L.join('\n'));
  process.exit(ready.blockers.length ? 1 : 0);
}

if (has('self-test')) {
  const A = { classes: [{ name: 'x-a', properties: { display: 'flex', 'font-size': '120px' } }, { name: 'x-b', properties: { width: '292px' } }] };
  const B = { classes: [{ name: 'x-a', properties: { display: 'flex', 'font-size': '76px' } }] };
  const o = overridesFor(A, B);
  const cases = [
    ['changed property becomes an override', o.find((c) => c.name === 'x-a').properties['font-size'] === '76px'],
    ['unchanged property is NOT re-authored', !('display' in o.find((c) => c.name === 'x-a').properties)],
    ['class absent at width becomes display:none', o.find((c) => c.name === 'x-b').properties.display === 'none'],
    ['hide rule carries its reason', /absent from the reference/.test(o.find((c) => c.name === 'x-b')._reason)],
    ['readiness flags a font the site lacks', readiness({ classes: [{ name: 'x', properties: { 'font-family': 'Neue Mono' } }] }, ['Inter']).blockers.some((b) => b.kind === 'font-not-on-site')],
    ['readiness flags a native-props leak', readiness({ classes: [{ name: 'x', properties: { 'font-size': 'clamp(1rem, 2vw, 3rem)' } }] }, ['Inter']).blockers.some((b) => b.kind === 'custom-property-leak')],
    ['clean plan has no blockers', readiness({ classes: [{ name: 'x', properties: { 'font-size': '13px', 'font-family': 'Inter' } }] }, ['Inter']).blockers.length === 0],
  ];
  let bad = 0;
  for (const [n, ok] of cases) if (!ok) { bad++; console.log('  FAIL  ' + n); }
  console.log(bad ? 'EVIDENCE wf-plan self-test — FAIL ' + bad + '/' + cases.length : 'EVIDENCE wf-plan self-test — OK ' + cases.length + ' case(s)');
  process.exit(bad ? 1 : 0);
}
main();
