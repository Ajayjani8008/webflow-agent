#!/usr/bin/env node
// wf-resolve.js — resolve and LOCK the build target before anything is written to Webflow.
//
// Why this exists (all three failures are on record in this repo's own state files):
//   · 2026-08-01: kush-hero was built on 2026-07-31, the target page was found EMPTY the next day and
//     the whole section was rebuilt from scratch. build_state.page.page_id pointed at "Home"
//     (6a23a9bc…) while the sections were being written to 6a488b8d…. A full section, paid twice.
//   · The same site's header shipped verification artefacts under BOTH "kush-nav" and "kush-navbar" —
//     two complete state/audit/score sets for one section, because the name was never locked.
//   · kush-header recorded publishes: 3 against a documented cap of 2, because the cap lived in prose.
// Prose cannot enforce any of that at turn 200 under a 500k context. This can.
//
// Usage:
//   node wf-resolve.js --site-id=<webflow site_id> [--slug=<shortName>] [--name=<display name>]
//                      [--page=<pageId>] [--page-name=<name>] [--branch=<branch>]
//                      [--section=<name>] [--switch-page] [--json]
//   node wf-resolve.js --site-id=… --section=… --publish [--force]     # count a publish, enforce cap 2
//   node wf-resolve.js --site-id=… --section=… --turns=N --calls=M     # budget checkpoint
//   node wf-resolve.js --self-test
//
// Exit: 0 ok · 1 blocked (mismatch / cap exceeded) · 2 usage or IO error.
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');

const WF = process.env.WF || path.join(os.homedir(), 'docs/memory/webflow');
const SITES = path.join(WF, 'sites');
const TEMPLATE = path.join(SITES, '_template');

const TURN_BUDGET = 25;
const CALL_BUDGET = 15;
const PUBLISH_CAP = 2;

const argv = process.argv.slice(2);
const flag = n => argv.includes('--' + n);
const opt = n => { const p = '--' + n + '='; const a = argv.find(x => x.startsWith(p)); return a ? a.slice(p.length) : null; };

const out = { ok: true, blockers: [], warnings: [], notes: [] };
const block = m => { out.ok = false; out.blockers.push(m); };
const warn = m => out.warnings.push(m);
const note = m => out.notes.push(m);

const readJSON = p => { try { return JSON.parse(fs.readFileSync(p, 'utf8')) } catch (e) { return null } };
const today = () => new Date().toISOString().slice(0, 10);

// ── site-id derivation: match on site_id first, then slug. NEVER invent a folder name. ──────────
function deriveSiteDir(siteId, slug, name, mkdir) {
  if (!fs.existsSync(SITES)) { if (!mkdir) return null; fs.mkdirSync(SITES, { recursive: true }); }
  const dirs = fs.readdirSync(SITES).filter(d => d !== '_template' && fs.statSync(path.join(SITES, d)).isDirectory());

  for (const d of dirs) {                                   // ① authoritative: recorded site_id
    const st = readJSON(path.join(SITES, d, 'build_state.json'));
    if (st && st.site && st.site.site_id && siteId && st.site.site_id === siteId) {
      return { dir: d, how: 'matched build_state.site.site_id', created: false };
    }
  }
  if (slug && dirs.includes(slug)) return { dir: slug, how: 'matched existing dir by slug', created: false };
  if (!slug) return null;                                   // ② no slug -> cannot safely name it
  if (!mkdir) return null;

  const dir = slug.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const full = path.join(SITES, dir);
  fs.mkdirSync(path.join(full, 'specs'), { recursive: true });
  for (const f of ['build_state.json', 'registry.md', 'pending_designer_work.md']) {
    const src = path.join(TEMPLATE, f);
    if (fs.existsSync(src) && !fs.existsSync(path.join(full, f))) fs.copyFileSync(src, path.join(full, f));
  }
  const st = readJSON(path.join(full, 'build_state.json')) || { schema_version: 2, sections: [] };
  st.site = { id: dir, name: name || slug, site_id: siteId || '' };
  fs.writeFileSync(path.join(full, 'build_state.json'), JSON.stringify(st, null, 2));
  return { dir, how: 'seeded from _template', created: true };
}

function run() {
  const siteId = opt('site-id'), slug = opt('slug'), name = opt('name');
  if (!siteId && !slug) { console.error('usage: node wf-resolve.js --site-id=<id> [--slug=<shortName>] [--page=<id>] [--section=<name>] …'); process.exit(2); }

  const res = deriveSiteDir(siteId, slug, name, true);
  if (!res) { console.error('BLOCKED: no state dir matches site_id=' + siteId + ' and no --slug given to seed one.\n  Fix: pass --slug=<shortName from data_sites_tool>. Never invent the folder name — a guessed name splits this site\'s state in two.'); process.exit(1); }

  const dir = path.join(SITES, res.dir);
  const statePath = path.join(dir, 'build_state.json');
  const st = readJSON(statePath) || { schema_version: 2, sections: [] };
  st.site = st.site || {}; st.sections = st.sections || [];
  if (siteId && !st.site.site_id) st.site.site_id = siteId;
  if (!st.site.id) st.site.id = res.dir;
  if (name && !st.site.name) st.site.name = name;
  note('site-id: ' + res.dir + ' (' + res.how + ')');

  // ── PAGE LOCK ────────────────────────────────────────────────────────────────────────────────
  const page = opt('page');
  st.page = st.page || { name: '', page_id: '', branch: '' };
  if (page) {
    if (st.page.page_id && st.page.page_id !== page && !flag('switch-page')) {
      block('PAGE MISMATCH: build_state.page.page_id = ' + st.page.page_id + ' but this build targets ' + page +
        '\n  This is the exact condition that caused a full section to be built twice (2026-08-01).' +
        '\n  Fix: confirm which page is correct, then re-run with --switch-page to move the lock.');
    } else {
      if (st.page.page_id !== page) note('page lock moved: ' + (st.page.page_id || '(none)') + ' -> ' + page);
      st.page.page_id = page;
      if (opt('page-name')) st.page.name = opt('page-name');
      if (opt('branch') !== null) st.page.branch = opt('branch');
    }
  } else if (!st.page.page_id) {
    warn('no page locked yet — pass --page=<pageId> before the first write');
  }

  // ── SECTION LOCK ─────────────────────────────────────────────────────────────────────────────
  const section = opt('section');
  let sec = null;
  if (section) {
    sec = st.sections.find(s => s.name === section);
    const near = st.sections.filter(s => s.name !== section && (s.name.startsWith(section) || section.startsWith(s.name)));
    if (!sec) {
      if (near.length) warn('SIMILAR SECTION ALREADY RECORDED: ' + near.map(s => s.name).join(', ') +
        '\n  One section under two names produces two full artefact sets (kush-nav / kush-navbar, 2026-07-31).' +
        '\n  Reuse the recorded name, or rename it deliberately.');
      sec = { name: section, page: st.page.name || '', status: 'in-progress', node_ids: [], pixel_score: 0, publishes: 0, updated: today() };
      st.sections.push(sec);
      note('section created: ' + section);
    } else {
      note('section resumed: ' + section + ' (status ' + sec.status + ', publishes ' + (sec.publishes || 0) + ')');
      if (sec.status === 'verified' || sec.status === 'responsive') {
        warn('section is already ' + sec.status + ' — confirm a rebuild is intended before writing');
      }
    }
    if (sec.spec === undefined) sec.spec = 'specs/' + section + '.md';
    const specFile = path.join(dir, 'specs', section + '.md');
    note('spec: ' + (fs.existsSync(specFile) ? 'present' : 'NOT WRITTEN YET — write it at intake (step 2)'));
  }

  // ── PUBLISH CAP ──────────────────────────────────────────────────────────────────────────────
  if (flag('publish')) {
    if (!sec) { console.error('--publish needs --section=<name>'); process.exit(2); }
    const n = (sec.publishes || 0) + 1;
    if (n > PUBLISH_CAP && !flag('force')) {
      block('PUBLISH CAP: this would be publish #' + n + ' for "' + section + '" (cap ' + PUBLISH_CAP + ').' +
        '\n  A 3rd publish means something is being fixed blind. Read the actual state first, then --force if it is genuinely needed.');
    } else {
      sec.publishes = n;
      if (n > PUBLISH_CAP) warn('publish #' + n + ' forced past the cap — state why in the report');
      note('publishes: ' + n + '/' + PUBLISH_CAP);
    }
  }

  // ── TURN / CALL BUDGET ───────────────────────────────────────────────────────────────────────
  const turns = opt('turns'), calls = opt('calls');
  if (turns || calls) {
    const t = Number(turns || 0), c = Number(calls || 0);
    note('budget: ' + t + '/' + TURN_BUDGET + ' turns · ' + c + '/' + CALL_BUDGET + ' calls');
    if (t > TURN_BUDGET || c > CALL_BUDGET) {
      warn('OVER BUDGET — cost is turns x context, so this is the moment it compounds.' +
        '\n  Report it in one line with what is still open and keep going. Never drop a gate to save tokens.');
    }
  }

  if (out.ok) {
    st.updated_at = today();
    if (sec) sec.updated = today();
    fs.writeFileSync(statePath, JSON.stringify(st, null, 2));
  }

  const payload = {
    ok: out.ok, siteDir: res.dir, sitePath: dir, siteId: st.site.site_id,
    page: st.page, section: section || null,
    publishes: sec ? sec.publishes || 0 : null,
    blockers: out.blockers, warnings: out.warnings, notes: out.notes,
  };
  if (flag('json')) { console.log(JSON.stringify(payload, null, 2)); }
  else {
    console.log('EVIDENCE wf-resolve  ' + (out.ok ? 'OK' : 'BLOCKED'));
    console.log('  site-dir   ' + res.dir + '   site_id ' + (st.site.site_id || '-'));
    console.log('  page       ' + (st.page.page_id || '-') + '  ' + (st.page.name || '') + (st.page.branch ? ' @' + st.page.branch : ''));
    if (section) console.log('  section    ' + section + '   publishes ' + (sec.publishes || 0) + '/' + PUBLISH_CAP);
    out.notes.forEach(n => console.log('  · ' + n));
    out.warnings.forEach(w => console.log('  WARN  ' + w));
    out.blockers.forEach(b => console.log('  BLOCK ' + b));
    if (!out.ok) console.log('  -> state NOT written; resolve the blocker first.');
  }
  process.exit(out.ok ? 0 : 1);
}

// ── self-test ─────────────────────────────────────────────────────────────────────────────────
if (flag('self-test')) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wfres-'));
  const sites = path.join(tmp, 'sites');
  fs.mkdirSync(path.join(sites, '_template', 'specs'), { recursive: true });
  fs.writeFileSync(path.join(sites, '_template', 'build_state.json'), JSON.stringify({ schema_version: 2, site: {}, page: {}, sections: [] }));
  const { execFileSync } = require('child_process');
  const runCli = (args, expect) => {
    let code = 0, stdout = '';
    try { stdout = execFileSync(process.execPath, [__filename, ...args], { env: { ...process.env, WF: tmp }, encoding: 'utf8' }); }
    catch (e) { code = e.status; stdout = (e.stdout || '') + (e.stderr || ''); }
    const pass = code === expect;
    console.log((pass ? 'PASS' : 'FAIL') + '  exit ' + code + ' (want ' + expect + ')  ' + args.join(' '));
    if (!pass) console.log(stdout);
    return pass;
  };
  let ok = true;
  ok &= runCli(['--site-id=S1', '--slug=demo-site', '--page=P1', '--section=hero'], 0);       // seed + lock
  ok &= runCli(['--site-id=S1', '--page=P1', '--section=hero'], 0);                            // resume by site_id, no slug
  ok &= runCli(['--site-id=S1', '--page=P2', '--section=hero'], 1);                            // page mismatch blocks
  ok &= runCli(['--site-id=S1', '--page=P2', '--section=hero', '--switch-page'], 0);           // explicit switch allowed
  ok &= runCli(['--site-id=S1', '--section=hero', '--publish'], 0);                            // publish 1
  ok &= runCli(['--site-id=S1', '--section=hero', '--publish'], 0);                            // publish 2
  ok &= runCli(['--site-id=S1', '--section=hero', '--publish'], 1);                            // publish 3 blocked
  ok &= runCli(['--site-id=S1', '--section=hero', '--publish', '--force'], 0);                 // forced
  ok &= runCli(['--site-id=S9'], 1);                                                           // unknown site, no slug
  // near-miss section name must warn, not silently create a second artefact set
  let nearOut = '';
  try { nearOut = execFileSync(process.execPath, [__filename, '--site-id=S1', '--section=heroine', '--json'], { env: { ...process.env, WF: tmp }, encoding: 'utf8' }); } catch (e) { nearOut = e.stdout || ''; }
  const nearOk = /SIMILAR SECTION ALREADY RECORDED/.test(nearOut);
  console.log((nearOk ? 'PASS' : 'FAIL') + '  near-miss section name warns (hero vs heroine)');
  ok &= nearOk;

  const st = readJSON(path.join(sites, 'demo-site', 'build_state.json'));
  const pubOk = st.sections[0].publishes === 3;
  console.log((pubOk ? 'PASS' : 'FAIL') + '  publish counter persisted = ' + st.sections[0].publishes);
  console.log((st.page.page_id === 'P2' ? 'PASS' : 'FAIL') + '  page lock persisted = ' + st.page.page_id);
  fs.rmSync(tmp, { recursive: true, force: true });
  process.exit(ok && pubOk ? 0 : 1);
}

run();
