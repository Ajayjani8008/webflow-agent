#!/usr/bin/env node
// wf-lint.js — reference validator for the Webflow GOAT pack.
// Catches the failure class that made rules silently no-op: instructions pointing at files,
// registry sections, skills or cross-references that do not exist.
//
// Usage:
//   node wf-lint.js                 # human report, exit 1 on errors
//   node wf-lint.js --json          # machine output
//   node wf-lint.js --baseline      # write scripts/.wf-lint-baseline.json (snapshot of current findings)
//   node wf-lint.js --compare       # diff against the baseline (regressions = exit 1)
// No dependencies. Read-only.

const fs = require('fs');
const path = require('path');
const os = require('os');

const HOME = os.homedir();
const PACK = path.join(HOME, '.claude');
const MEM = path.join(HOME, 'docs/memory/webflow');
// Repo location varies per machine — set WF_REPO to the pack root (the dir holding
// agents/ rules/ skills/), else the known clone paths are probed in order.
const REPO = (() => {
  if (process.env.WF_REPO) return process.env.WF_REPO;
  const candidates = [
    'My_Projects/My_Agents/webflow-agent-main/webflow-agent/webflow-goat-agent',
    'Ajay/My_Project/agent/webflow-agnet/webflow-goat-agent',
  ].map((p) => path.join(HOME, p));
  return candidates.find((p) => fs.existsSync(p)) || candidates[0];
})();
const AGENT = path.join(PACK, 'agents/webflow/webflow-goat.md');
const RULES = path.join(PACK, 'rules/webflow/core.md');
const SKILLS_DIR = path.join(PACK, 'skills');

// the 15 webflow skills the agent owns (respira/divi share the dir but belong to another pack)
const WF_SKILLS = ['build-reference', 'cms-build', 'component-build', 'custom-code-once', 'design-intake',
  'figma-setup', 'html-intake', 'motion-build', 'pixel-verify', 'portable-mode', 'responsive-pass',
  'session-recovery', 'url-intake', 'webflow-help', 'webflow-platform'];

// per-site state files: valid if the template carries them (sites/<id>/ copies are made per build)
const PER_SITE = ['registry.md', 'build_state.json', 'pending_designer_work.md'];

const errors = [];
const warnings = [];
const err = (kind, msg, where) => errors.push({ kind, msg, where });
const warn = (kind, msg, where) => warnings.push({ kind, msg, where });

const read = p => { try { return fs.readFileSync(p, 'utf8') } catch (e) { return null } };
const exists = p => fs.existsSync(p);

// ---------- collect pack files ----------
const files = [];
if (exists(AGENT)) files.push({ id: 'agent', path: AGENT, text: read(AGENT) });
else err('missing-file', 'agent file not found', AGENT);
if (exists(RULES)) files.push({ id: 'rules', path: RULES, text: read(RULES) });
else err('missing-file', 'routing rules not found', RULES);
for (const s of WF_SKILLS) {
  const p = path.join(SKILLS_DIR, s, 'SKILL.md');
  if (exists(p)) files.push({ id: s, path: p, text: read(p) });
  else err('missing-skill', `skill referenced by the agent has no SKILL.md`, p);
}

const headings = {};           // skill id -> [heading text]
const bodyLines = {};          // skill id -> raw lines (for §-id fallback)
for (const f of files) {
  headings[f.id] = (f.text.match(/^#{1,6} .*$/gm) || []).map(h => h.replace(/^#+\s*/, '').trim());
  bodyLines[f.id] = f.text.split('\n');
}

// ---------- 1. file paths mentioned in the pack must exist ----------
const PATH_RE = /(?:\$WF\/|docs\/memory\/webflow\/|~\/\.claude\/)[A-Za-z0-9_\-./]+/g;
const seenPaths = new Map();
for (const f of files) {
  for (const raw of f.text.match(PATH_RE) || []) {
    let t = raw.replace(/[.,;:)`'"]+$/, '');
    if (/[{}<>*]/.test(t) || t.endsWith('/')) continue;
    if (!seenPaths.has(t)) seenPaths.set(t, new Set());
    seenPaths.get(t).add(f.id);
  }
}
for (const [tok, refs] of seenPaths) {
  let abs;
  if (tok.startsWith('$WF/')) abs = path.join(MEM, tok.slice(4));
  else if (tok.startsWith('~/.claude/')) abs = path.join(PACK, tok.slice(10));
  else abs = path.join(HOME, tok);                       // docs/memory/webflow/...
  if (exists(abs)) continue;
  const base = path.basename(abs);
  // per-site caches live under sites/<id>/ — a bare figma-cache/ref-cache path resolves if any site has it
  const siteRel = tok.replace(/^.*?(figma-cache|ref-cache)\//, '$1/');
  if (/^(figma-cache|ref-cache)\//.test(siteRel)) {
    const sitesDir = path.join(MEM, 'sites');
    const hit = exists(sitesDir) && fs.readdirSync(sitesDir).some(s => exists(path.join(sitesDir, s, siteRel)));
    if (hit) continue;
  }
  // per-site files are legal when the template holds them
  if (PER_SITE.includes(base) && exists(path.join(MEM, 'sites/_template', base))) continue;
  // scripts may live under scripts/ after the v1.9.0 move
  if (base.endsWith('.js') && exists(path.join(MEM, 'scripts', base))) continue;
  err('missing-file', `path referenced but not on disk: ${tok}`, [...refs].join(','));
}

// ---------- 1b. per-site state files mentioned by bare name must exist in the template ----------
for (const base of PER_SITE) {
  const refs = files.filter(f => f.text.includes(base)).map(f => f.id);
  if (!refs.length) continue;
  const tpl = path.join(MEM, 'sites/_template', base);
  if (!exists(tpl) && !exists(path.join(MEM, base))) {
    err('missing-file', `state file referenced ${refs.length}× but absent: ${base}`, refs.slice(0, 6).join(','));
  }
}

// ---------- 2. registry sections referenced must exist in the template ----------
const regTemplate = read(path.join(MEM, 'sites/_template/registry.md')) || read(path.join(MEM, 'registry.md'));
const regHeads = regTemplate ? (regTemplate.match(/^##+ .*$/gm) || []).map(h => h.replace(/^#+\s*/, '').trim().toLowerCase()) : null;
const SECTION_RE = /registry(?:\.md)?\s*(?:§|##)\s*([A-Za-z][A-Za-z-]*)/g;
const wantSections = new Map();
for (const f of files) {
  let m; while ((m = SECTION_RE.exec(f.text))) {
    const name = m[1].trim();
    if (!wantSections.has(name)) wantSections.set(name, new Set());
    wantSections.get(name).add(f.id);
  }
}
if (!regTemplate) err('missing-file', 'registry template not found (sites/_template/registry.md)', 'state');
else for (const [name, refs] of wantSections) {
  if (!regHeads.some(h => h === name.toLowerCase() || h.startsWith(name.toLowerCase()))) {
    err('missing-section', `registry.md has no "## ${name}" section`, [...refs].join(','));
  }
}

// ---------- 3. cross-references <skill> § <section> must resolve ----------
const skillIds = files.map(f => f.id).filter(id => id !== 'agent' && id !== 'rules');
const XREF_RE = new RegExp(`\\b(${skillIds.join('|')})\\s*(?:§|&sect;)\\s*([A-Za-z0-9][A-Za-z0-9.\\-]*(?:\\s+[A-Za-z0-9][A-Za-z0-9.\\-/]*){0,4})`, 'g');
const STOP = new Set(['the', 'a', 'of', 'and', 'to', 'in', 'on', 'for', 'its', 'it']);
for (const f of files) {
  let m; while ((m = XREF_RE.exec(f.text))) {
    const target = m[1];
    let ref = m[2].trim().replace(/[.,;:)`'"]+$/, '');
    if (!headings[target]) continue;
    const numeric = /^[A-Z]?\d|^[A-Z]\.\d|^\d/.test(ref);
    const hs = headings[target].map(h => h.toLowerCase());
    if (numeric) {
      const id = ref.split(/\s+/)[0].replace(/[^A-Za-z0-9.]/g, '').replace(/\.+$/, '');
      const hit = hs.some(h => h.startsWith(id.toLowerCase() + ' ') || h.startsWith(id.toLowerCase() + '.'))
        || bodyLines[target].some(l => l.trim().startsWith('**' + id) || l.trim().startsWith('## ' + id) || l.trim().startsWith(id + ' '));
      if (!hit) {
        const top = id.split('.')[0].toLowerCase();
        const soft = hs.some(h => h.startsWith(top + '.') || h.startsWith(top + ' '))
          || bodyLines[target].some(l => l.trim().startsWith('**' + top));
        (soft ? warn : err)('bad-xref', `${target} § ${id} — section id not found in ${target}`, f.id);
      }
    } else {
      // prose refs often trail into the sentence ("§ SVG pre-flight on each one"), so accept the
      // longest prefix that matches a heading; require >=2 significant words so a wrong name still fails
      const words = ref.toLowerCase().split(/\s+/).filter(w => w.length > 2 && !STOP.has(w));
      if (!words.length) continue;
      let hit = false;
      for (let n = words.length; n >= Math.min(2, words.length); n--) {
        const probe = words.slice(0, n);
        if (hs.some(h => probe.every(w => h.includes(w)))) { hit = true; break }
      }
      if (!hit) warn('bad-xref', `${target} § ${ref} — no heading matches`, f.id);
    }
  }
}

// ---------- 4. skills named in the agent's skill list must exist ----------
const agentText = (files.find(f => f.id === 'agent') || {}).text || '';
for (const name of agentText.match(/`([a-z][a-z-]{3,})`/g) || []) {
  const n = name.replace(/`/g, '');
  if (WF_SKILLS.includes(n)) continue;
  if (fs.existsSync(path.join(SKILLS_DIR, n))) continue;                       // another pack's skill
  if (/^(data_|designer_|element_|asset_|get_|query_|set_|move_|remove_|insert_|create_|update_|delete_|unregister_|duplicate_|transform_|webflow_)/.test(n)) continue; // tool names
}

// ---------- 5. live ↔ repo parity ----------
const pairs = [[AGENT, path.join(REPO, 'agents/webflow-goat.md')], [RULES, path.join(REPO, 'rules/webflow-core.md')]];
for (const s of WF_SKILLS) pairs.push([path.join(SKILLS_DIR, s, 'SKILL.md'), path.join(REPO, 'skills', s, 'SKILL.md')]);
if (exists(REPO)) {
  for (const [live, repo] of pairs) {
    if (!exists(live) || !exists(repo)) { if (exists(live) && !exists(repo)) warn('repo-missing', `not in repo: ${path.relative(PACK, live)}`, 'sync'); continue; }
    if (read(live) !== read(repo)) err('repo-drift', `live ≠ repo: ${path.relative(PACK, live)}`, 'sync');
  }
} else warn('repo-missing', 'repo copy not found — parity unchecked', REPO);

// ---------- 6. verification scripts present ----------
for (const s of ['shot-el.js', 'state-shot.js', 'motion-verify.js', 'pixel-diff.js', 'ref-extract.js']) {
  if (!exists(path.join(MEM, 'scripts', s)) && !exists(path.join(MEM, s))) err('missing-script', `verification script absent: ${s}`, 'scripts');
}

// ---------- output ----------
const out = { errors, warnings, counts: { errors: errors.length, warnings: warnings.length }, at: new Date().toISOString() };
const BASE = path.join(MEM, 'scripts/.wf-lint-baseline.json');
const argv = process.argv.slice(2);

if (argv.includes('--baseline')) {
  fs.writeFileSync(BASE, JSON.stringify(out, null, 2));
  console.log(`baseline written: ${errors.length} errors, ${warnings.length} warnings → ${BASE}`);
  process.exit(0);
}
if (argv.includes('--json')) { console.log(JSON.stringify(out, null, 2)); process.exit(errors.length ? 1 : 0); }

const group = list => list.reduce((a, e) => ((a[e.kind] = a[e.kind] || []).push(e), a), {});
console.log(`wf-lint — ${errors.length ? 'FAIL' : 'PASS'}: ${errors.length} errors, ${warnings.length} warnings`);
for (const [kind, list] of Object.entries(group(errors))) {
  console.log(`\n  ${kind} (${list.length})`);
  list.slice(0, 40).forEach(e => console.log(`    ${e.msg}${e.where ? `   [${e.where}]` : ''}`));
  if (list.length > 40) console.log(`    … ${list.length - 40} more`);
}
if (warnings.length) {
  console.log(`\n  warnings (${warnings.length})`);
  warnings.slice(0, 25).forEach(w => console.log(`    ${w.msg}${w.where ? `   [${w.where}]` : ''}`));
  if (warnings.length > 25) console.log(`    … ${warnings.length - 25} more`);
}
if (argv.includes('--compare') && exists(BASE)) {
  const base = JSON.parse(read(BASE));
  const key = e => `${e.kind}|${e.msg}`;
  const had = new Set(base.errors.map(key));
  const regressions = errors.filter(e => !had.has(key(e)));
  console.log(`\ncompare vs baseline: ${base.counts.errors} → ${errors.length} errors · ${regressions.length} new`);
  regressions.forEach(r => console.log(`  NEW  ${r.msg}`));
  process.exit(regressions.length ? 1 : 0);
}
process.exit(errors.length ? 1 : 0);
