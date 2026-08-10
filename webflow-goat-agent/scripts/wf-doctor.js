// wf-doctor.js — one call at session start so the build never improvises its own environment.
//
// Why this exists (measured, footer session 2026-08-07): a build session spent calls on `npm install`
// mid-flight, on `NODE_PATH=$(...)` prefixes to make a verify script resolve `ws`, and on inline
// `sleep 20` / `sleep 25` before verification. None of that is Webflow work. Worse, an environment that
// half-works makes a gate look broken, and a gate that looks broken gets skipped.
//
// Usage:
//   node wf-doctor.js [--json] [--fix]
//     --fix  runs `npm install` in the scripts dir when a dependency is missing (the only repair it does)
//
// Exit 0 everything a build needs is present · 1 something a gate depends on is missing · 2 IO error.
const fs = require('fs'); const path = require('path'); const os = require('os');
const { spawnSync } = require('child_process');
const argv = process.argv.slice(2);
const has = n => argv.includes('--' + n);
const SCRIPTS = __dirname;
const WF = process.env.WF || path.join(os.homedir(), 'docs/memory/webflow');

const checks = []; const add = (name, ok, detail, fatal = true) => checks.push({ name, ok, detail, fatal });

// ---- 1. the scripts a gate depends on
const NEEDED = ['wf-resolve.js', 'wf-section.js', 'wf-preflight.js', 'url-compile.js', 'content-coverage.js',
  'verify-section.js', 'dom-contract.js', 'pixel-diff.js', 'page-audit.js', 'ref-extract.js', 'shot.js',
  'shot-el.js', 'state-shot.js', 'text-extents.js', 'ref-digest.js', 'ref-integrity.js', 'motion-verify.js',
  'wf-report.js', 'figma-parse.js', 'figma-compile.js', 'skeletons.json'];
const missing = NEEDED.filter(f => !fs.existsSync(path.join(SCRIPTS, f)));
add('pipeline scripts present', missing.length === 0, missing.length ? 'missing: ' + missing.join(', ') : `${NEEDED.length} present`);

// ---- 2. node deps, resolvable FROM THE SCRIPTS DIR (the thing NODE_PATH hacks were papering over)
const deps = ['ws', 'pngjs', 'pixelmatch'];
const badDeps = [];
for (const d of deps) {
  try { require.resolve(d, { paths: [SCRIPTS, path.join(SCRIPTS, 'node_modules')] }) }
  catch (e) { badDeps.push(d) }
}
if (badDeps.length && has('fix')) {
  const r = spawnSync('npm', ['install', '--silent', '--no-audit', '--no-fund'], { cwd: SCRIPTS, encoding: 'utf8' });
  const still = deps.filter(d => { try { require.resolve(d, { paths: [SCRIPTS] }); return false } catch (e) { return true } });
  add('node deps (after --fix npm install)', still.length === 0, still.length ? 'still missing: ' + still.join(', ') + (r.stderr || '').slice(0, 200) : 'installed');
} else {
  add('node deps resolvable from scripts dir', badDeps.length === 0,
    badDeps.length ? `missing: ${badDeps.join(', ')} — run: node wf-doctor.js --fix   (never a NODE_PATH prefix; that hides it for one call)` : deps.join(', '));
}

// ---- 3. headless Chrome, which every visual gate needs
const CHROME = process.platform === 'darwin' ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  : process.platform === 'win32' ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : 'google-chrome';
let chromeOk = fs.existsSync(CHROME);
if (!chromeOk && process.platform === 'linux') chromeOk = spawnSync('which', ['google-chrome'], { encoding: 'utf8' }).status === 0;
add('headless Chrome', chromeOk, chromeOk ? CHROME : 'not found — shot/verify/page-audit/state-shot all fail without it');

// ---- 4. state root
add('state root exists', fs.existsSync(path.join(WF, 'sites')), path.join(WF, 'sites'));
const sites = fs.existsSync(path.join(WF, 'sites')) ? fs.readdirSync(path.join(WF, 'sites')).filter(d => !d.startsWith('.')) : [];
add('site state dirs', true, sites.length ? sites.join(', ') : 'none yet — wf-resolve seeds one', false);

// ---- 5. every tracked site's build_state parses and records its site_id
for (const s of sites) {
  if (s === '_template') continue;
  const p = path.join(WF, 'sites', s, 'build_state.json');
  if (!fs.existsSync(p)) { add(`state ${s}`, false, 'build_state.json missing'); continue }
  let j = null; try { j = JSON.parse(fs.readFileSync(p, 'utf8')) } catch (e) { add(`state ${s}`, false, 'build_state.json does not parse'); continue }
  const id = j.site && j.site.site_id;
  add(`state ${s}: site_id recorded`, !!id,
    id || 'EMPTY — a later session matching on site_id will not find this dir and may seed a second one', false);
  // a section marked in-progress with no cost is an unrecorded build: the state is lying about reality
  for (const sec of (j.sections || [])) {
    if (sec.status === 'in-progress' && !sec.cost) {
      add(`state ${s}: section "${sec.name}" unrecorded`, false,
        'status=in-progress with no measured cost — either it was never built, or it was built and `wf-section record` never ran. Reconcile before building on top of it', false);
    }
  }
}

const fatalFails = checks.filter(c => !c.ok && c.fatal);
const warnFails = checks.filter(c => !c.ok && !c.fatal);
if (has('json')) { console.log(JSON.stringify({ ok: fatalFails.length === 0, checks }, null, 1)); process.exit(fatalFails.length ? 1 : 0) }

console.log(`EVIDENCE wf-doctor — ${fatalFails.length ? 'FAIL' : 'OK'}   ${checks.length} check(s)`);
for (const c of checks) console.log(`  ${c.ok ? 'ok  ' : (c.fatal ? 'FAIL' : 'warn')}  ${c.name}${c.detail ? '   ' + c.detail : ''}`);
if (fatalFails.length) console.log('  -> fix these before the first MCP write. A half-working environment makes a gate look broken, and a gate that looks broken gets skipped.');
else if (warnFails.length) console.log('  -> warnings are state drift, not environment: reconcile them so the state stops lying about what is built.');
process.exit(fatalFails.length ? 1 : 0);
