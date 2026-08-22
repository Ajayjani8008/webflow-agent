#!/usr/bin/env node
// wf-verify-pack.js — ONE command that says whether the pack is shippable.
//
// Why: validating a pack edit took four separate commands (wf-lint, the self-test suite, a line-ending
// check, a three-root sync diff) run by hand, ten times over in a single maintenance session on
// 2026-08-22. Four commands run by memory is three chances to skip one, and the one skipped is the one
// that would have caught the regression: that session shipped CRLF into eight files and reintroduced a
// client identifier by syncing in the wrong direction, both of which a single gate would have refused.
//
// Checks, in order of how expensive they are to get wrong:
//   1. wf-lint            — structure, budgets, repo parity, and the client-identity sweep
//   2. self-tests         — every script that ships a --self-test, plus pixel-diff.test.js
//   3. line endings       — LF only; .gitattributes forces LF because wf-lint compares byte-for-byte
//   4. extra-clone parity — any additional working copy passed with --also=<path>
//
// Usage:
//   node wf-verify-pack.js [--also=<pack root>]... [--mirror] [--json]
//     --also=<path>   also compare this working copy against the repo
//     --mirror        with --also: COPY the repo version over any file that differs (repo is the source
//                     of truth; the clone is a git checkout, so the overwrite is recoverable)
// Exit: 0 everything green · 1 something failed.
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

const SCRIPTS = __dirname;
const HOME = os.homedir();
const MEM = path.join(HOME, 'docs/memory/webflow');
const PACK = path.join(HOME, '.claude');
const argv = process.argv.slice(2);
const JSONOUT = argv.includes('--json');
const also = argv.filter(a => a.startsWith('--also=')).map(a => a.slice(7));
const MIRROR = argv.includes('--mirror');   // with --also: copy repo -> clone instead of only reporting
const REPO = process.env.WF_REPO || null;

const results = [];
const add = (name, ok, detail) => results.push({ name, ok, detail });
const exists = p => { try { return fs.existsSync(p) } catch (e) { return false } };
const read = p => { try { return fs.readFileSync(p, 'utf8') } catch (e) { return null } };

// ---------- 1. wf-lint ----------
{
  const r = spawnSync(process.execPath, [path.join(SCRIPTS, 'wf-lint.js')], { encoding: 'utf8' });
  const out = (r.stdout || '') + (r.stderr || '');
  const line = (out.split('\n').find(l => /^wf-lint/.test(l)) || '').trim();
  add('wf-lint', r.status === 0, line || 'no output');
  if (r.status !== 0) {
    for (const l of out.split('\n').filter(l => /^\s{4}/.test(l)).slice(0, 8)) results.push({ name: '', ok: false, detail: l.trim(), child: true });
  }
}

// ---------- 2. self-tests ----------
{
  const files = fs.readdirSync(SCRIPTS).filter(f => f.endsWith('.js') && f !== 'wf-verify-pack.js');
  // scripts declare the flag as flag('self-test'), has('self-test') or argv.includes('--self-test');
  // match the flag NAME so a new script is picked up however it wires it in
  const withSelfTest = files.filter(f => /self-test/.test(read(path.join(SCRIPTS, f)) || ''));
  let failed = [];
  for (const f of withSelfTest) {
    const r = spawnSync(process.execPath, [path.join(SCRIPTS, f), '--self-test'], { encoding: 'utf8', timeout: 180000 });
    if (r.status !== 0) failed.push(f);
  }
  if (exists(path.join(SCRIPTS, 'pixel-diff.test.js'))) {
    const r = spawnSync(process.execPath, [path.join(SCRIPTS, 'pixel-diff.test.js')], { encoding: 'utf8', timeout: 180000 });
    if (r.status !== 0) failed.push('pixel-diff.test.js');
    withSelfTest.push('pixel-diff.test.js');
  }
  add('self-tests', failed.length === 0,
    failed.length ? `${failed.length} failing: ${failed.join(', ')}` : `${withSelfTest.length}/${withSelfTest.length} green`);
}

// ---------- 3. line endings ----------
{
  const roots = [path.join(PACK, 'skills'), path.join(PACK, 'agents'), SCRIPTS, MEM, REPO].filter(r => r && exists(r));
  const bad = [];
  const walk = (dir, depth) => {
    if (depth > 6) return;
    let entries; try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch (e) { return }
    for (const e of entries) {
      // `sites/` is per-site RUNTIME state the agent writes during a build — it is never byte-compared
      // against the repo, so its line endings are nobody's business. Only pack files are checked.
      if (['node_modules', '.git', '.cache', 'sites', 'verify', 'ref-cache', 'figma-cache'].includes(e.name)) continue;
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p, depth + 1);
      else if (/\.(md|js|json|sh|swift)$/.test(e.name)) {
        const b = read(p);
        if (b && b.includes('\r\n')) bad.push(p);
      }
    }
  };
  for (const r of roots) walk(r, 0);
  add('line endings (LF)', bad.length === 0,
    bad.length ? `${bad.length} file(s) with CRLF — wf-lint compares byte-for-byte, so this reports as drift: ${bad.slice(0, 3).map(p => path.basename(p)).join(', ')}` : 'all LF');
}

// ---------- 4. extra-clone parity ----------
if (also.length) {
  for (const clone of also) {
    if (!exists(clone)) { add(`clone parity: ${clone}`, false, 'path not found'); continue }
    const base = REPO && exists(REPO) ? REPO : null;
    if (!base) { add(`clone parity: ${path.basename(clone)}`, false, 'WF_REPO not set, nothing to compare against'); continue }
    const diffs = [];
    const walk = (rel, depth) => {
      if (depth > 6) return;
      const a = path.join(base, rel), b = path.join(clone, rel);
      let entries; try { entries = fs.readdirSync(a, { withFileTypes: true }) } catch (e) { return }
      for (const e of entries) {
        if (['node_modules', '.git', '.cache', 'sites'].includes(e.name)) continue;
        const r2 = path.join(rel, e.name);
        if (e.isDirectory()) walk(r2, depth + 1);
        else if (/\.(md|js|json)$/.test(e.name)) {
          if (read(path.join(a, r2 === rel ? e.name : e.name)) === null) continue;
          if (read(path.join(base, r2)) !== read(path.join(clone, r2))) diffs.push(r2);
        }
      }
    };
    walk('', 0);
    // --mirror turns the check into a fix: copy repo -> clone for every differing file. The repo is the
    // git source of truth, so this direction is always the safe one; the clone is recoverable from git.
    // Without it, keeping N working copies in step is manual, and manual propagation is what put CRLF in
    // eight files and re-introduced a client identifier by syncing the wrong way round (2026-08-22).
    if (MIRROR && diffs.length) {
      let copied = 0;
      for (const rel of diffs) {
        const src = path.join(base, rel), dst = path.join(clone, rel);
        try { fs.mkdirSync(path.dirname(dst), { recursive: true }); fs.copyFileSync(src, dst); copied++; }
        catch (e) { /* reported as remaining drift below */ }
      }
      const still = diffs.filter(rel => read(path.join(base, rel)) !== read(path.join(clone, rel)));
      add(`clone mirror: ${path.basename(clone)}`, still.length === 0,
        `copied ${copied} file(s) from the repo` + (still.length ? `; ${still.length} still differ` : ''));
      diffs.length = 0;
      diffs.push(...still);
    }
    add(`clone parity: ${path.basename(clone)}`, diffs.length === 0,
      diffs.length ? `${diffs.length} file(s) differ from the repo: ${diffs.slice(0, 3).join(', ')}` +
        ' — re-run with --mirror to copy the repo version over them' : 'identical to the repo');
  }
} else {
  add('clone parity', true, 'no --also= clone given (pass one per extra working copy)');
}

// ---------- report ----------
const failures = results.filter(r => !r.ok && !r.child);
if (JSONOUT) {
  console.log(JSON.stringify({ ok: failures.length === 0, checks: results }, null, 1));
  process.exit(failures.length ? 1 : 0);
}
console.log(`EVIDENCE wf-verify-pack — ${failures.length ? 'FAIL' : 'OK'}   ${results.filter(r => !r.child).length} check(s)`);
for (const r of results) {
  if (r.child) { console.log(`          ${r.detail}`); continue }
  console.log(`  ${r.ok ? 'ok  ' : 'FAIL'}  ${r.name.padEnd(22)} ${r.detail}`);
}
if (failures.length) console.log('  -> the pack is NOT shippable until these are green. Fix, then re-run this one command.');
process.exit(failures.length ? 1 : 0);
