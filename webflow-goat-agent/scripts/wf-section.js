#!/usr/bin/env node
// wf-section.js — the section pipeline as three calls instead of twelve.
//
// Cost in a conversation is turns x context, not payload size. The 2026-07-31 session spent 235 turns
// and 107 tool calls on ONE header section (72.5M context-read, 51 minutes) — and the scripts it was
// calling were already correct. What was missing is that each one had to be invoked, read and reasoned
// about separately. This chains them:
//
//   token    refuses to bless a build until target+spec+plan+inventory exist and preflight passes NOW
//   intake   ANY source -> plan + contract (+ content inventory) -> wf-preflight   (1 call, blocks a bad plan)
//            figma:    figma-parse -> figma-compile
//            url/html: url-compile -> content-coverage inventory
//   verify   verify-section -> dom-contract -> plan-diff              (1 call, one EVIDENCE set)
//   record   build_state + registry + spec status                    (1 call, one write pass)
//
// Usage:
//   node wf-section.js intake --site=<dir> --section=<name> --prefix=<block>
//                             --dcjsx=<node.dc.jsx>        # figma
//                             | --extract=<capture.json>   # url or html delivery
//                             | --screenshot=<image.png>   # screenshot (OCR + measured pixels)
//                             [--mode=replica|adapt] [--font=X] [--root=<nodeId>] [--section-tag]
//                             [--site-prefix=<id>] [--known-prefixes=a,b]
//   node wf-section.js verify --site=<dir> --section=<name> --url=<published> --sel="<css>"
//                             [--widths=1440,991,767,390] [--ref=<dir>|auto] [--unscored-ok=767,390 --unscored-reason="…"]
//                             [--states=base,auto] [--no-plan-diff]
//                             [--audit] [--width=1920] [--no-contract]
//   node wf-section.js assets --site=<dir> --put="name=id,name=id"   |   --get=name1,name2   |   --list
//        The site's asset-id map, cached in build_state.assets. list_assets returns every asset on the
//        site and blew the 75KB response limit on a 100-asset site — twice, for seven ids. Cache once,
//        then it is zero calls forever.
//   node wf-section.js record --site=<dir> --section=<name> --status=<s> [--score=N]
//                             [--node-ids=a,b] [--report=…] [--responsive=…] [--a11y=PASS|FAIL:note]
//                             [--registry="| class | … |"] [--recovery=…]
//   node wf-section.js --self-test
//
// --site accepts the state dir name (as printed by wf-resolve.js) or an absolute path.
// Exit: 0 all green · 1 a stage failed or blocked · 2 usage/IO error.
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

const WF = process.env.WF || path.join(os.homedir(), 'docs/memory/webflow');
const SCRIPTS = __dirname;
const argv = process.argv.slice(2);
const cmd = argv[0];
const flag = n => argv.includes('--' + n);
const opt = (n, d = null) => { const p = '--' + n + '='; const a = argv.find(x => x.startsWith(p)); return a ? a.slice(p.length) : d; };
const today = () => new Date().toISOString().slice(0, 10);

function siteDir() {
  const s = opt('site');
  if (!s) die('--site=<state dir name or path> is required');
  const p = path.isAbsolute(s) ? s : path.join(WF, 'sites', s);
  if (!fs.existsSync(p)) die('site state dir not found: ' + p + '\n  Run wf-resolve.js first — it derives and seeds the dir.');
  return p;
}
function die(m) { console.error(m); process.exit(2); }
function readJSON(p) { try { return JSON.parse(fs.readFileSync(p, 'utf8')) } catch (e) { return null } }

// run a pack script, stream its output through, return {code, stdout}
function stage(label, script, args, { optional = false } = {}) {
  const file = path.join(SCRIPTS, script);
  if (!fs.existsSync(file)) {
    if (optional) { console.log('  SKIP  ' + label + ' (' + script + ' not installed)'); return { code: 0, stdout: '', skipped: true }; }
    die('missing script: ' + file);
  }
  const r = spawnSync(process.execPath, [file, ...args], { encoding: 'utf8' });
  const stdout = (r.stdout || '') + (r.stderr || '');
  process.stdout.write(stdout);
  return { code: r.status == null ? 2 : r.status, stdout };
}

// ── INTAKE ────────────────────────────────────────────────────────────────────────────────────
function intake() {
  const dir = siteDir();
  const section = opt('section') || die('--section=<name> is required');
  const prefix = opt('prefix') || section;
  fs.mkdirSync(path.join(dir, 'specs'), { recursive: true });

  // SOURCE-AGNOSTIC (v2.1.7). This used to hard-require --dcjsx, so it was Figma-only: a URL or HTML
  // reference had no compile path at all and got hand-authored, which is how one header cost 204 calls
  // and shipped at 1.4% of its reference's strings. Every reference type now compiles through here.
  //   --dcjsx=<file>          figma  -> figma-parse -> figma-compile
  //   --extract=<file>        url/html -> url-compile (a ref-extract capture; html-intake produces the
  //                           same shape by running the delivery through ref-extract on a file:// URL)
  const dcjsx = opt('dcjsx'), extract = opt('extract'), shot = opt('screenshot');
  const given = [dcjsx, extract, shot].filter(Boolean);
  if (!given.length) die('give the source:\n' +
    '    --dcjsx=<node.dc.jsx>        figma      -> figma-parse -> figma-compile\n' +
    '    --extract=<capture.json>     url/html   -> url-compile\n' +
    '    --screenshot=<image.png>     screenshot -> shot-compile (OCR + measured pixels; v2.1.12)');
  if (given.length > 1) die('pass ONE source, not several — hybrid sources declare roles in the spec (webflow-core § C).');
  const src = dcjsx || extract || shot;
  if (!fs.existsSync(src)) die('not found: ' + src);

  const mode = (opt('mode') || 'replica').toLowerCase();
  if (!['replica', 'adapt'].includes(mode)) die('--mode must be replica or adapt (webflow-core § url-intake: replica is the default)');

  const base = src.replace(/\.dc\.jsx$/, '').replace(/\.json$/, '');
  const parsed = base + '.parsed.json';
  const plan = path.join(dir, 'specs', section + '.plan.json');
  const contract = path.join(dir, 'specs', section + '.contract.json');
  const inventory = path.join(dir, 'specs', section + '.inventory.json');

  console.log('EVIDENCE wf-section intake  section=' + section + '  source=' + (dcjsx ? 'figma' : shot ? 'screenshot' : 'url/html') + '  mode=' + mode);
  let r;
  if (dcjsx) {
    r = stage('parse', 'figma-parse.js', [dcjsx, '--out=' + parsed]);
    if (r.code !== 0) { console.log('  FAIL  figma-parse'); process.exit(1); }
    const cargs = [parsed, '--prefix=' + prefix, '--out-plan=' + plan, '--out-contract=' + contract];
    if (opt('root')) cargs.push('--root=' + opt('root'));
    if (flag('section-tag')) cargs.push('--section-tag');
    r = stage('compile', 'figma-compile.js', cargs);
    if (r.code !== 0) { console.log('  FAIL  figma-compile'); process.exit(1); }
    // A Figma reference's copy can be substituted exactly as easily as a URL's. figma-parse emits
    // nodes[].text, so the SAME gate works — it was simply never wired here (v2.1.10).
    r = stage('inventory', 'content-coverage.js', ['inventory', parsed, inventory]);
    if (r.code !== 0) { console.log('  FAIL  content-coverage inventory'); process.exit(1); }
    console.log('  inventory ' + inventory + '   <- step 6b verifies the published page against this, --mode=' + mode);
  } else if (shot) {
    // A screenshot compiles too (v2.1.12): OCR for the strings + boxes, pixels for colours, backgrounds,
    // gaps and filled-button detection. It writes its own inventory, so this source is no longer hand work.
    const cargs = [shot, '--prefix=' + prefix, '--section=' + section, '--out-plan=' + plan,
      '--out-contract=' + contract, '--out-inventory=' + inventory];
    if (opt('font')) cargs.push('--font=' + opt('font'));
    if (opt('dpr')) cargs.push('--dpr=' + opt('dpr'));
    r = stage('compile', 'shot-compile.js', cargs);
    if (r.code !== 0) { console.log('  FAIL  shot-compile'); process.exit(1); }
    console.log('  inventory ' + inventory + '   <- from OCR; step 6b verifies the published page against it');
    console.log('  NOTE      font SIZE is an estimate from cap-height — step 3c (text-extents check-spec) is NOT optional');
    console.log('            for this source, and behaviour parity is impossible from a still: ask for a URL/HTML');
    console.log('            reference or a recording before claiming any hover/scroll/load state.');
  } else {
    const cargs = [extract, '--prefix=' + prefix, '--section=' + section, '--out-plan=' + plan, '--out-contract=' + contract];
    if (opt('font')) cargs.push('--font=' + opt('font'));
    if (opt('max-depth')) cargs.push('--max-depth=' + opt('max-depth'));
    r = stage('compile', 'url-compile.js', cargs);
    if (r.code !== 0) { console.log('  FAIL  url-compile'); process.exit(1); }
    // the content inventory is what makes a substituted-copy build detectable at all
    r = stage('inventory', 'content-coverage.js', ['inventory', extract, inventory]);
    if (r.code !== 0) { console.log('  FAIL  content-coverage inventory'); process.exit(1); }
    console.log('  inventory ' + inventory + '   <- step 6b verifies the published page against this, --mode=' + mode);
  }

  r = stage('preflight', 'wf-preflight.js', [plan,
    ...(opt('site-prefix') ? ['--site-prefix=' + opt('site-prefix')] : []),
    ...(opt('known-prefixes') ? ['--known-prefixes=' + opt('known-prefixes')] : [])]);
  const verdict = r.code === 0 ? 'PASS' : 'BLOCKED';

  console.log('  plan      ' + plan);
  console.log('  contract  ' + contract);
  console.log('  preflight ' + verdict);
  if (r.code !== 0) {
    console.log('  -> fix the PLAN, not the build. Do not spend an MCP write on a plan that preflight rejects.');
    process.exit(1);
  }
  const spec = path.join(dir, 'specs', section + '.md');
  if (!fs.existsSync(spec)) {
    console.log('  spec      NOT WRITTEN — write ' + spec + ' now (source structure · elements · effect manifest E1..En · responsive · open questions).');
    console.log('             The spec is the build contract; a later session resumes from it with zero history.');
  } else console.log('  spec      ' + spec);
  process.exit(0);
}


// ── BUILD TOKEN ───────────────────────────────────────────────────────────────────────────────
// Why this exists (measured, footer session 2026-08-07): 68 calls, 57 minutes, and NOT ONE pipeline
// script ran — no wf-resolve, no intake, no preflight, no record. The section was hand-rolled with raw
// MCP plus `node -e` one-liners, into a site with no state dir at all, borrowing another site's ref-cache.
// Every gate in this pack was advisory prose, and prose loses under context pressure.
//
// So the readiness to build is now a THING YOU MUST PRODUCE, re-verified at the moment you ask:
//   node wf-section.js token --site=<dir> --section=<name> [--source=figma|url|html|screenshot]
// It prints BUILD-TOKEN only when the target is locked, the spec and plan exist, preflight passes RIGHT NOW,
// and (for url/html) the content inventory exists. webflow-core forbids an MCP write without it.
function token() {
  const dir = siteDir();
  const section = opt('section') || die('--section=<name> is required');
  const source = (opt('source') || 'url').toLowerCase();
  const st = readJSON(path.join(dir, 'build_state.json')) || {};
  const specs = path.join(dir, 'specs');
  const spec = path.join(specs, section + '.md');
  const plan = path.join(specs, section + '.plan.json');
  const inv = path.join(specs, section + '.inventory.json');
  const fails = [], warns = [];

  if (!(st.site && st.site.site_id)) fails.push('build_state.site.site_id is empty — run wf-resolve.js --site-id=<id> --slug=<shortName> first. Building into a site with no recorded id is how a footer landed on an untracked site on 2026-08-07');
  if (!(st.page && st.page.page_id)) fails.push('no page lock in build_state — wf-resolve.js --page=<id> locks the target (Rule 6: build where the user is)');
  if (!fs.existsSync(spec)) fails.push('spec missing: ' + spec + ' — the spec IS the build contract; a cold session resumes from it');
  if (!fs.existsSync(plan)) fails.push('plan missing: ' + plan + ' — run `wf-section.js intake` (it compiles the plan; hand-authoring one is what cost 204 calls)');
  // EVERY source needs a content inventory (v2.1.10). A machine capture produces it (url/html/figma);
  // a screenshot has none, so the strings are transcribed by hand into the same file. Same gate either way —
  // otherwise the one source without a gate is the one where substituted content ships unnoticed.
  if (!fs.existsSync(inv)) {
    fails.push(source === 'screenshot'
      ? 'content inventory missing: ' + inv + ' — a screenshot has no machine capture, so TRANSCRIBE every visible string into it as {"strings":[{"text":"…"}],"structure":{},"counts":{}}. Without it nothing can tell a replica from substituted content (step 6b)'
      : 'content inventory missing: ' + inv + ' — run `wf-section.js intake` (it writes one for figma, url and html). Without it no gate can tell a replica from substituted content (step 6b)');
  }

  let pf = null;
  if (fs.existsSync(plan)) {
    pf = stage('preflight', 'wf-preflight.js', [plan,
      ...(opt('site-prefix') ? ['--site-prefix=' + opt('site-prefix')] : (st.site && st.site.id ? ['--site-prefix=' + st.site.id] : [])),
      ...(opt('known-prefixes') ? ['--known-prefixes=' + opt('known-prefixes')] : [])]);
    if (pf.code !== 0) fails.push('preflight does NOT pass on the current plan — fix the plan, not the build');
  }

  for (const sec of (st.sections || [])) {
    if (sec.name !== section && sec.status === 'in-progress' && !sec.cost) {
      warns.push(`section "${sec.name}" is in-progress with no recorded cost — either unbuilt or built-and-never-recorded. Reconcile it, or the state keeps lying`);
    }
  }

  console.log('EVIDENCE wf-section token  section=' + section + '  source=' + source);
  for (const w of warns) console.log('  warn  ' + w);
  if (fails.length) {
    for (const f of fails) console.log('  FAIL  ' + f);
    console.log('  NO BUILD TOKEN — an MCP write now is a process failure, not a shortcut.');
    process.exit(1);
  }
  const stamp = [st.site.site_id, st.page.page_id, section, String(fs.statSync(plan).mtimeMs | 0)].join(':');
  let h = 0; for (const ch of stamp) h = (h * 31 + ch.charCodeAt(0)) | 0;
  console.log('  site      ' + st.site.site_id + '   page ' + st.page.page_id);
  console.log('  spec      ' + spec);
  console.log('  plan      ' + plan + '   preflight PASS');
  if (fs.existsSync(inv)) console.log('  inventory ' + inv);
  console.log('  BUILD-TOKEN ' + Math.abs(h).toString(36) + '   valid for this section while the plan is unchanged');
  process.exit(0);
}

// ── VERIFY ────────────────────────────────────────────────────────────────────────────────────
function verify() {
  const dir = siteDir();
  const section = opt('section') || die('--section=<name> is required');
  const url = opt('url') || die('--url=<published url> is required');
  const sel = opt('sel') || die('--sel="<css selector>" is required');
  const outDir = opt('out', path.join(dir, 'verify'));
  fs.mkdirSync(outDir, { recursive: true });

  const vargs = [url, sel, outDir, '--section=' + section, '--widths=' + opt('widths', '1440,991,767,390')];
  // AUTO-DISCOVER the reference shots (v2.1.11). verify-section now refuses to print PASS with nothing
  // scored, and the flag it needs was the one easiest to forget: a header was reported PASS/"NOT scored"
  // because --ref was never passed. Look where every intake puts them before asking the caller to remember.
  let ref = opt('ref');
  if (!ref) {
    const cands = [];
    const rc = path.join(dir, 'ref-cache');
    if (fs.existsSync(rc)) for (const d of fs.readdirSync(rc)) cands.push(path.join(rc, d, 'shots'));
    cands.push(path.join(dir, 'figma-cache', '04-screenshots'), path.join(dir, 'specs', 'shots'));
    ref = cands.find(c => fs.existsSync(c) && fs.readdirSync(c).some(f => f.startsWith(section) && f.endsWith('.png')))
       || cands.find(c => fs.existsSync(c) && fs.readdirSync(c).some(f => f.endsWith('.png')));
    if (ref) console.log('  ref       ' + ref + '   (auto-discovered; pass --ref to override)');
    else console.log('  ref       NONE FOUND — verify-section will refuse to report PASS. Capture reference shots, or\n' +
                     '            declare the absence: --unscored-ok=<widths> --unscored-reason="<why>" (Rule G)');
  }
  if (ref) vargs.push('--ref=' + ref);
  if (opt('unscored-ok')) vargs.push('--unscored-ok=' + opt('unscored-ok'));
  if (opt('unscored-reason')) vargs.push('--unscored-reason=' + opt('unscored-reason'));
  if (opt('states')) vargs.push('--states=' + opt('states'));
  if (flag('audit') || !flag('no-audit')) vargs.push('--audit');

  console.log('EVIDENCE wf-section verify  section=' + section);
  const v = stage('verify-section', 'verify-section.js', vargs);

  let c = { code: 0, skipped: true };
  const contract = opt('contract', path.join(dir, 'specs', section + '.contract.json'));
  if (!flag('no-contract')) {
    if (fs.existsSync(contract)) {
      c = stage('dom-contract', 'dom-contract.js', ['verify', url, contract, '--width=' + opt('width', '1920')]);
    } else {
      console.log('  WARN  no contract at ' + contract + ' — property equality is the PRIMARY gate; a pixel score alone is a coarse safety net.');
      console.log('        Generate one with: node wf-section.js intake … (figma-compile emits it) ');
      c = { code: 0, skipped: true, missing: true };
    }
  }

  // plan-diff: every other gate verifies what EXISTS, so a build that is a subset of its plan passes them
  // all. Measured 2026-08-07: a 582-node plan shipped as 25 divs / 16 links — 2.7% of its classes — with
  // property equality and a11y both green. This is the only gate that sees that.
  let pd = { code: 0, skipped: true };
  const planPath = opt('plan', path.join(dir, 'specs', section + '.plan.json'));
  if (!flag('no-plan-diff')) {
    if (fs.existsSync(planPath)) pd = stage('plan-diff', 'plan-diff.js', ['verify', planPath, url,
      '--min-class=' + opt('min-class', '100'), '--min-string=' + opt('min-string', '100')]);
    else console.log('  WARN  no plan at ' + planPath + ' — structural omission cannot be detected without one (run intake).');
  }

  const pass = v.code === 0 && c.code === 0 && pd.code === 0;

  // Progress ledger (v2.1): a verify that reproduces the previous verdict AND score closed nothing.
  // Two of those is STALLED — pixel-verify has always said so; this makes it checkable in code.
  const statePath = path.join(dir, 'build_state.json');
  const st = readJSON(statePath);
  if (st) {
    const sec = (st.sections || []).find(s => s.name === section);
    if (sec) {
      const m = v.stdout.match(/match\s+([0-9]+(?:\.[0-9]+)?)%/);
      const sig = (pass ? 'PASS' : 'FAIL') + '|' + (m ? m[1] : '-') + '|' + (c.code === 0 ? 'CONTRACT-PASS' : 'CONTRACT-FAIL');
      sec.verify_log = sec.verify_log || [];
      const prev = sec.verify_log[sec.verify_log.length - 1];
      sec.verify_log.push(sig);
      if (sec.verify_log.length > 8) sec.verify_log = sec.verify_log.slice(-8);
      fs.writeFileSync(statePath, JSON.stringify(st, null, 2));
      if (!pass && prev === sig) {
        const same = sec.verify_log.filter(x => x === sig).length;
        console.log('  ── NO PROGRESS: identical to the previous verify (' + sig + ', seen ' + same + 'x)');
        if (same >= 2) {
          console.log('     STALLED. Two consecutive passes closed nothing, so the next step is NOT another');
          console.log('     fix-and-publish. Measure the delta (text-extents bands / dom-contract / hot');
          console.log('     regions) and fix from the number, or report the remaining diffs with evidence.');
        }
      }
    }
  }

  console.log('  ── combined verdict: ' + (pass ? 'PASS' : 'FAIL'));
  console.log('     pixels/a11y/states ' + (v.code === 0 ? 'PASS' : 'FAIL') +
    '   property equality ' + (c.skipped ? (c.missing ? 'NO CONTRACT' : 'skipped') : (c.code === 0 ? 'PASS' : 'FAIL')));
  if (!pass) console.log('     -> ONE batched fix pass, re-check only the open items + 3-5 neighbours. STALLED is illegal while a CRITICAL/MAJOR diff is open.');
  process.exit(pass ? 0 : 1);
}

// ── RECORD ────────────────────────────────────────────────────────────────────────────────────
function record() {
  const dir = siteDir();
  const section = opt('section') || die('--section=<name> is required');
  const statePath = path.join(dir, 'build_state.json');
  const st = readJSON(statePath) || die('unreadable build_state.json at ' + statePath);
  st.sections = st.sections || [];
  let sec = st.sections.find(s => s.name === section);
  if (!sec) { sec = { name: section, status: 'built', publishes: 0 }; st.sections.push(sec); }

  const VALID = ['planned', 'in-progress', 'built', 'verified', 'responsive', 'blocked'];
  const status = opt('status');
  if (status) {
    if (!VALID.includes(status)) die('--status must be one of: ' + VALID.join(' | '));
    sec.status = status;
  }
  if (opt('score')) sec.pixel_score = Number(opt('score'));
  if (opt('node-ids')) sec.node_ids = opt('node-ids').split(',').map(s => s.trim()).filter(Boolean);
  if (opt('report')) sec.verification_report = opt('report');
  if (opt('responsive')) sec.responsive_report = opt('responsive');
  if (opt('a11y')) { const [v, ...rest] = opt('a11y').split(':'); sec.a11y_perf = { verdict: v, report: rest.join(':') }; }
  if (opt('motion')) { const [v, ...rest] = opt('motion').split(':'); sec.motion = { verdict: v, report: rest.join(':') }; }
  sec.spec = sec.spec || 'specs/' + section + '.md';
  sec.page = sec.page || (st.page && st.page.name) || '';
  sec.updated = today();
  if (opt('recovery')) st.recovery_point = opt('recovery');
  st.updated_at = today();
  fs.writeFileSync(statePath, JSON.stringify(st, null, 2));

  // FIX 2: cost is measured from the transcript, not recalled. Stored so a later session can compare.
  const rep = stage('cost', 'wf-report.js', ['--json', ...(opt('since') ? ['--since=' + opt('since')] : [])], { optional: true });
  if (!rep.skipped && rep.stdout) {
    try {
      const c = JSON.parse(rep.stdout);
      if (c && !c.error) {
        sec.cost = { turns: c.turns, calls: c.calls, publishes: c.publishes, peakContext: c.peakContext,
                     newTokens: c.newTokens, contextReRead: c.cacheRead, minutes: c.minutes, images: c.imgs };
        fs.writeFileSync(statePath, JSON.stringify(st, null, 2));
      }
    } catch (e) { /* a report is never a gate */ }
  }

  const lines = ['EVIDENCE wf-section record  section=' + section,
    '  status    ' + sec.status + (sec.pixel_score ? '   score ' + sec.pixel_score : ''),
    '  state     ' + statePath];
  if (sec.cost) lines.push('  cost      ' + sec.cost.turns + ' turns · ' + sec.cost.calls + ' calls · ' +
    sec.cost.publishes + ' publishes · peak ' + Math.round(sec.cost.peakContext / 1000) + 'k' +
    (sec.cost.minutes != null ? ' · ' + sec.cost.minutes + ' min' : '') +
    ((sec.cost.calls > 15 || sec.cost.turns > 25 || sec.cost.publishes > 2) ? '   OVER BUDGET — paste the wf-report block in the section report' : '   within budget'));

  const reg = opt('registry');
  if (reg) {
    const rp = path.join(dir, 'registry.md');
    const cur = fs.existsSync(rp) ? fs.readFileSync(rp, 'utf8') : '';
    if (cur.includes(reg.trim())) lines.push('  registry  already present, not duplicated');
    else { fs.appendFileSync(rp, (cur.endsWith('\n') ? '' : '\n') + reg.trim() + '\n'); lines.push('  registry  appended'); }
  }

  // gate: a [critical] item for THIS section blocks "verified"/"responsive"
  const ledger = path.join(dir, 'pending_designer_work.md');
  if (fs.existsSync(ledger) && ['verified', 'responsive'].includes(sec.status)) {
    const open = fs.readFileSync(ledger, 'utf8').split('\n')
      .filter(l => /\[critical\]/i.test(l) && l.toLowerCase().includes(section.toLowerCase()));
    if (open.length) {
      lines.push('  WARN      ' + open.length + ' open [critical] item(s) for this section — it is not "complete":');
      open.forEach(l => lines.push('            ' + l.trim().slice(0, 120)));
    }
  }
  console.log(lines.join('\n'));
  process.exit(0);
}

// ── ASSETS: the site's name->id map, cached (FIX 3) ───────────────────────────────────────────
function assets() {
  const dir = siteDir();
  const statePath = path.join(dir, 'build_state.json');
  const st = readJSON(statePath) || die('unreadable build_state.json at ' + statePath);
  st.assets = st.assets || {};

  if (opt('put')) {
    let n = 0;
    for (const pair of opt('put').split(',')) {
      const i = pair.indexOf('=');
      if (i < 1) continue;
      const k = pair.slice(0, i).trim(), v = pair.slice(i + 1).trim();
      if (!k || !v) continue;
      st.assets[k] = v; n++;
    }
    fs.writeFileSync(statePath, JSON.stringify(st, null, 2));
    console.log('EVIDENCE wf-section assets  cached ' + n + ' id(s), ' + Object.keys(st.assets).length + ' total');
    process.exit(0);
  }
  if (opt('get')) {
    const want = opt('get').split(',').map(s => s.trim()).filter(Boolean);
    const miss = want.filter(w => !st.assets[w]);
    console.log('EVIDENCE wf-section assets  ' + (miss.length ? 'INCOMPLETE' : 'HIT') + '  ' + (want.length - miss.length) + '/' + want.length);
    for (const w of want) console.log('  ' + w.padEnd(28) + (st.assets[w] || 'MISSING'));
    if (miss.length) console.log('  -> fetch only the missing ones, then cache them with --put=');
    process.exit(miss.length ? 1 : 0);
  }
  const keys = Object.keys(st.assets).sort();
  console.log('EVIDENCE wf-section assets  ' + keys.length + ' cached for this site');
  for (const k of keys) console.log('  ' + k.padEnd(28) + st.assets[k]);
  process.exit(0);
}

// ── self-test ─────────────────────────────────────────────────────────────────────────────────
function selfTest() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wfsec-'));
  const site = path.join(tmp, 'site');
  fs.mkdirSync(path.join(site, 'specs'), { recursive: true });
  fs.writeFileSync(path.join(site, 'build_state.json'), JSON.stringify({ schema_version: 2, site: {}, page: { name: 'Home' }, sections: [] }));
  fs.writeFileSync(path.join(site, 'registry.md'), '# Registry\n');
  fs.writeFileSync(path.join(site, 'pending_designer_work.md'), '- [critical] hero slider transition — Designer only\n');
  const run = a => { const r = spawnSync(process.execPath, [__filename, ...a], { encoding: 'utf8' }); return { code: r.status, out: (r.stdout || '') + (r.stderr || '') }; };
  let ok = true;
  const t = (name, cond, extra) => { console.log((cond ? 'PASS' : 'FAIL') + '  ' + name); if (!cond && extra) console.log(extra); ok = ok && cond; };

  let r = run(['record', '--site=' + site, '--section=hero', '--status=built', '--score=98.2', '--registry=| hero | built |']);
  t('record creates + writes', r.code === 0 && readJSON(path.join(site, 'build_state.json')).sections[0].pixel_score === 98.2, r.out);
  r = run(['record', '--site=' + site, '--section=hero', '--registry=| hero | built |']);
  t('registry line not duplicated', /not duplicated/.test(r.out), r.out);
  r = run(['record', '--site=' + site, '--section=hero', '--status=verified']);
  t('open [critical] surfaces on verified', /open \[critical\]/.test(r.out), r.out);
  r = run(['record', '--site=' + site, '--section=hero', '--status=done']);
  t('invalid status rejected', r.code === 2, r.out);
  r = run(['record', '--site=' + tmp + '/nope', '--section=hero']);
  t('missing site dir rejected', r.code === 2, r.out);
  r = run(['intake', '--site=' + site, '--section=hero', '--dcjsx=' + path.join(tmp, 'absent.dc.jsx'), '--prefix=hero']);
  t('intake rejects a missing source', r.code === 2, r.out);
  // ── build-token gate: readiness must be produced, not assumed ──
  r = run(['token', '--site=' + site, '--section=nope']);
  t('token refuses when spec+plan are absent', r.code === 1 && /NO BUILD TOKEN/.test(r.out), r.out);
  const st0 = JSON.parse(fs.readFileSync(path.join(site, 'build_state.json'), 'utf8'));
  st0.site = { id: 'demo-site', name: 'demo', site_id: '' }; st0.page = { page_id: 'P1' };
  fs.writeFileSync(path.join(site, 'build_state.json'), JSON.stringify(st0));
  r = run(['token', '--site=' + site, '--section=nope']);
  t('token names an empty site_id as the blocker', /site_id is empty/.test(r.out), r.out);
  st0.site.site_id = 'S1'; fs.writeFileSync(path.join(site, 'build_state.json'), JSON.stringify(st0));
  fs.mkdirSync(path.join(site, 'specs'), { recursive: true });
  fs.writeFileSync(path.join(site, 'specs', 'tok.md'), '# spec');
  fs.writeFileSync(path.join(site, 'specs', 'tok.plan.json'), JSON.stringify({ section: 'tok', classes: [], tree: { type: 'DivBlock', styleNames: ['demo-site__row'] } }));
  r = run(['token', '--site=' + site, '--section=tok', '--source=url']);
  t('token still refuses without a content inventory (url source)', r.code === 1 && /inventory missing/.test(r.out), r.out);
  fs.writeFileSync(path.join(site, 'specs', 'tok.inventory.json'), JSON.stringify({ strings: [], structure: {}, counts: { strings: 0, groups: 0 } }));
  r = run(['token', '--site=' + site, '--section=tok', '--source=url']);
  t('token issues BUILD-TOKEN when target+spec+plan+inventory+preflight all hold', r.code === 0 && /BUILD-TOKEN /.test(r.out), r.out);
  r = run(['token', '--site=' + site, '--section=tok', '--source=figma']);
  t('figma source needs the SAME content inventory (v2.1.10)', r.code === 0, r.out);
  fs.unlinkSync(path.join(site, 'specs', 'tok.inventory.json'));
  r = run(['token', '--site=' + site, '--section=tok', '--source=figma']);
  t('figma without an inventory is refused too', r.code === 1 && /inventory missing/.test(r.out), r.out);
  r = run(['token', '--site=' + site, '--section=tok', '--source=screenshot']);
  t('screenshot is told to TRANSCRIBE the strings, not exempted', r.code === 1 && /TRANSCRIBE/.test(r.out), r.out);

  r = run(['intake', '--site=' + site, '--section=hero', '--prefix=hero']);
  t('intake with NO source names both figma and url/html paths', r.code === 2 && /--dcjsx/.test(r.out) && /--extract/.test(r.out), r.out);
  r = run(['intake', '--site=' + site, '--section=hero', '--prefix=hero', '--dcjsx=a.dc.jsx', '--extract=b.json']);
  t('intake rejects two sources at once', r.code === 2, r.out);
  // a real URL/HTML extract must compile end to end through the same command Figma uses
  const ex = path.join(tmp, 'ex.json');
  fs.writeFileSync(ex, JSON.stringify({ url: 'https://e.com/', viewport: { width: 1440 }, nodes: [
    { tag: 'header', depth: 0, path: 'header', class: 'nav', box: { x: 0, y: 0, w: 1440, h: 80 }, styles: { display: 'flex', height: '80px' } },
    { tag: 'span', depth: 1, path: 'header>span', class: 'nav__label', text: 'Products', box: { x: 10, y: 10, w: 60, h: 20 }, styles: { 'font-size': '14px' } },
  ] }));
  r = run(['intake', '--site=' + site, '--section=urlsec', '--prefix=acme-urlsec', '--extract=' + ex]);
  t('URL/HTML source compiles through wf-section intake (was Figma-only)', r.code === 0 && /source=url\/html/.test(r.out), r.out);
  t('intake writes the content inventory for url/html', fs.existsSync(path.join(site, 'specs', 'urlsec.inventory.json')), r.out);
  t('intake defaults to replica mode', /mode=replica/.test(r.out), r.out);
  r = run(['verify', '--site=' + site, '--section=hero', '--url=http://x', '--sel=.hero', '--no-contract', '--widths=']);
  t('verify surfaces a failing stage', r.code === 1, '');
  fs.rmSync(tmp, { recursive: true, force: true });
  process.exit(ok ? 0 : 1);
}

if (flag('self-test')) selfTest();
else if (cmd === 'intake') intake();
else if (cmd === 'token') token();
else if (cmd === 'verify') verify();
else if (cmd === 'record') record();
else if (cmd === 'assets') assets();
else die('usage: node wf-section.js <intake|token|verify|record> --site=<dir> --section=<name> …   |   --self-test');
