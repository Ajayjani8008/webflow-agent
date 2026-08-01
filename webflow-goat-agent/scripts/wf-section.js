#!/usr/bin/env node
// wf-section.js — the section pipeline as three calls instead of twelve.
//
// Cost in a conversation is turns x context, not payload size. The 2026-07-31 session spent 235 turns
// and 107 tool calls on ONE header section (72.5M context-read, 51 minutes) — and the scripts it was
// calling were already correct. What was missing is that each one had to be invoked, read and reasoned
// about separately. This chains them:
//
//   intake   figma-parse -> figma-compile -> wf-preflight            (1 call, blocks a bad plan)
//   verify   verify-section -> dom-contract                          (1 call, one EVIDENCE set)
//   record   build_state + registry + spec status                    (1 call, one write pass)
//
// Usage:
//   node wf-section.js intake --site=<dir> --section=<name> --dcjsx=<file> --prefix=<block>
//                             [--root=<nodeId>] [--section-tag]
//   node wf-section.js verify --site=<dir> --section=<name> --url=<published> --sel="<css>"
//                             [--widths=1440,991,767,390] [--ref=<dir>] [--states=base,auto]
//                             [--audit] [--width=1920] [--no-contract]
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
  const dcjsx = opt('dcjsx') || die('--dcjsx=<node.dc.jsx> is required (from get_design_context)');
  const prefix = opt('prefix') || section;
  if (!fs.existsSync(dcjsx)) die('not found: ' + dcjsx);

  const base = dcjsx.replace(/\.dc\.jsx$/, '');
  const parsed = base + '.parsed.json';
  const plan = base + '.plan.json';
  const contract = path.join(dir, 'specs', section + '.contract.json');
  fs.mkdirSync(path.join(dir, 'specs'), { recursive: true });

  console.log('EVIDENCE wf-section intake  section=' + section);
  let r = stage('parse', 'figma-parse.js', [dcjsx, '--out=' + parsed]);
  if (r.code !== 0) { console.log('  FAIL  figma-parse'); process.exit(1); }

  const cargs = [parsed, '--prefix=' + prefix, '--out-plan=' + plan, '--out-contract=' + contract];
  if (opt('root')) cargs.push('--root=' + opt('root'));
  if (flag('section-tag')) cargs.push('--section-tag');
  r = stage('compile', 'figma-compile.js', cargs);
  if (r.code !== 0) { console.log('  FAIL  figma-compile'); process.exit(1); }

  r = stage('preflight', 'wf-preflight.js', [plan]);
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

// ── VERIFY ────────────────────────────────────────────────────────────────────────────────────
function verify() {
  const dir = siteDir();
  const section = opt('section') || die('--section=<name> is required');
  const url = opt('url') || die('--url=<published url> is required');
  const sel = opt('sel') || die('--sel="<css selector>" is required');
  const outDir = opt('out', path.join(dir, 'verify'));
  fs.mkdirSync(outDir, { recursive: true });

  const vargs = [url, sel, outDir, '--section=' + section, '--widths=' + opt('widths', '1440,991,767,390')];
  if (opt('ref')) vargs.push('--ref=' + opt('ref'));
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

  const pass = v.code === 0 && c.code === 0;

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

  const lines = ['EVIDENCE wf-section record  section=' + section,
    '  status    ' + sec.status + (sec.pixel_score ? '   score ' + sec.pixel_score : ''),
    '  state     ' + statePath];

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
  r = run(['verify', '--site=' + site, '--section=hero', '--url=http://x', '--sel=.hero', '--no-contract', '--widths=']);
  t('verify surfaces a failing stage', r.code === 1, '');
  fs.rmSync(tmp, { recursive: true, force: true });
  process.exit(ok ? 0 : 1);
}

if (flag('self-test')) selfTest();
else if (cmd === 'intake') intake();
else if (cmd === 'verify') verify();
else if (cmd === 'record') record();
else die('usage: node wf-section.js <intake|verify|record> --site=<dir> --section=<name> …   |   --self-test');
