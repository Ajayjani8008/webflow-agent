#!/usr/bin/env node
// verify-section.js — ONE call that produces the whole verification evidence set for a section.
// Replaces ~12 separate tool calls (4 shots + 4 diffs + 2 audits + states) with one, which is the
// dominant token saving: in a conversation every tool result is re-sent with every later call, so
// call count — not output size — is what compounds. Accuracy is unchanged: same scripts, same
// thresholds, same fail-closed verdicts, just aggregated.
//
// Usage:
//   node verify-section.js <url> <selector> <outDir> [options]
//     --section=hero               name used for output files (default: derived from selector)
//     --widths=1440,991,767,390    capture + score these widths (first = primary/anchor)
//     --mobile=767,390             widths that get CDP mobile emulation (default: <=767)
//     --ref=<dir>                  reference PNGs, matched as <section>-<width>.png
//     --states=base,auto,scroll:40 also capture interaction states at the primary width
//     --audit                      also run page-audit at primary + smallest width
//     --min=99 --cell=25 --height=2   pixel-diff thresholds (defaults = the strict gate)
//     --anchor-seen="<what the side-by-side showed>"   required to reach PASS; without it a clean run is
//                                     PASS-PENDING-ANCHOR and exits 1. No script can see what a render looks like.
//     --json                       machine output only
//
// Exit: 0 = every check PASSED · 1 = at least one FAILED · 2 = usage/IO/browser error.
// A missing reference for a width is reported as UNSCORED, never silently passed.
const CDP = require('child_process'); const http = require('http'); const fs = require('fs');
const os = require('os'); const path = require('path');
let WebSocket; try { WebSocket = require('ws') } catch (e) {
  try { WebSocket = require(path.join(__dirname, '..', 'node_modules', 'ws')) }
  catch (e2) { WebSocket = require(path.join(os.homedir(), 'node_modules', 'ws')) }
}
const CHROME = process.platform === 'darwin' ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  : process.platform === 'win32' ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : 'google-chrome';

const args = process.argv.slice(2);
const pos = args.filter(a => !a.startsWith('--'));
const flag = (n, d) => { const f = args.find(x => x === `--${n}` || x.startsWith(`--${n}=`)); return f === undefined ? d : (f.includes('=') ? f.split('=').slice(1).join('=') : true); };
const [url, sel, outDir] = pos;
if (args.includes('--self-test')) { selfTest(); }
if (!url || !sel || !outDir) {
  console.error('usage: node verify-section.js <url> <selector> <outDir> [--section= --widths= --ref= --unscored-ok=767,390 --unscored-reason="…" --states= --audit --min= --cell= --height= --json]   |   --self-test');
  process.exit(2);
}
const section = flag('section', sel.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'section');
const widths = String(flag('widths', '1440,991,767,390')).split(',').map(Number).filter(Boolean);
const mobileSet = new Set(String(flag('mobile', '767,390')).split(',').map(Number));
const refDir = flag('ref', null);
// Rule G: an absent reference frame is legitimate, but it must be DECLARED with a reason, never discovered
// silently. Undeclared UNSCORED is a fail, so "PASS (unscored)" can no longer be printed.
const unscoredOk = String(flag('unscored-ok', '') || '').split(',').map(Number).filter(Boolean);
const unscoredReason = flag('unscored-reason', null) || 'no reason given';
const states = flag('states', null);
const doAudit = !!flag('audit', false);
const MIN = flag('min', '99'), CELL = flag('cell', '25'), HEIGHT = flag('height', '2');
// The anchor view (webflow-core Rule 1 / pixel-verify): a global percentage cannot see a small text run and
// property equality cannot see an element that renders empty. Measured: 98.75% PASS, zero hot regions,
// dom-contract 158/158 — with an entire text line missing. So a clean score is PASS-PENDING-ANCHOR, never PASS,
// until the side-by-side has actually been looked at and what it showed is recorded here.
const anchorSeen = String(flag('anchor-seen', '')).trim();
const asJson = !!flag('json', false);
const basePort = 9400 + (process.pid % 120);

const wait = ms => new Promise(r => setTimeout(r, ms));

// "Blank" must be measured in PIXELS, never in compressed BYTES. A flat, legitimately simple section
// (a dark 72px header bar with a wordmark) compresses under any byte threshold and was reported BLANK,
// failing a correct build; conversely a large uniformly-empty PNG sailed past it. inkRatio returns the
// fraction of pixels that differ from the modal (background) colour, so an empty shot is empty because
// nothing rendered — not because PNG happened to compress well. Returns null if the PNG can't be read
// (caller then falls back to the old byte heuristic rather than skipping the check).
// Guards the blank rule against the regression it just fixed: a flat-but-real bar must NOT read blank,
// and a big uniform PNG must. The old `bytes < 7000` rule failed both cases.
// Pure, so the self-test can assert the verdict ladder without launching a browser.
// Order matters: a real failure outranks everything; nothing-measured is not a pass; a clean score is
// still not a pass until the anchor view has been recorded (webflow-core Rule 1).
function decideVerdict(failCount, measured, anchorOk) {
  if (failCount) return 'FAIL';
  if (!measured) return 'UNVERIFIED';
  if (!anchorOk) return 'PASS-PENDING-ANCHOR';
  return 'PASS';
}

function selfTest() {
  let PNG; try { PNG = require('pngjs').PNG } catch (e) { console.error('SKIP self-test: pngjs missing (npm install here)'); process.exit(2) }
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-selftest-'));
  const write = (name, w, h, paint) => {
    const p = new PNG({ width: w, height: h });
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4; const c = paint(x, y);
      p.data[i] = c[0]; p.data[i + 1] = c[1]; p.data[i + 2] = c[2]; p.data[i + 3] = 255;
    }
    const f = path.join(tmp, name); fs.writeFileSync(f, PNG.sync.write(p)); return f;
  };
  const BG = [10, 4, 24];
  const uniform = write('uniform.png', 1440, 400, () => BG);
  // a dark bar with a small light wordmark: ~2% of pixels, and it compresses to a few KB
  const flatBar = write('flat-bar.png', 1440, 72, (x, y) => (y > 24 && y < 48 && x > 40 && x < 200) ? [255, 255, 255] : BG);
  let ok = true;
  // a verdict of PASS with nothing measured was the contradiction that let a 1.4% header through
  const noRef = require('child_process').spawnSync(process.execPath, [__filename, 'file:///dev/null', 'body', tmp, '--widths=1440'], { encoding: 'utf8' });
  const cases = [
    ['no --ref can never print PASS', /VERDICT: (FAIL|UNVERIFIED)/.test((noRef.stdout || '') + (noRef.stderr || '')) || noRef.status !== 0, true],
    ['uniform PNG reads blank', inkRatio(uniform) < 0.001, true],
    ['flat real bar does NOT read blank', inkRatio(flatBar) < 0.001, false],
    ['old byte rule would have failed the real bar', fs.statSync(flatBar).size < 7000, true],
    // the anchor ladder — the gate that stops a green script verdict from closing a section on its own
    ['a real failure still outranks the anchor', decideVerdict(1, true, true) === 'FAIL', true],
    ['nothing measured is never a pass', decideVerdict(0, false, true) === 'UNVERIFIED', true],
    ['clean scores without the anchor view do NOT print PASS', decideVerdict(0, true, false) === 'PASS-PENDING-ANCHOR', true],
    ['clean scores WITH the anchor view print PASS', decideVerdict(0, true, true) === 'PASS', true],
    ['a too-short anchor note does not count as having looked', 'ok'.trim().length >= 12, false],
  ];
  for (const [name, got, want] of cases) {
    const pass = got === want; ok = ok && pass;
    console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}` + (pass ? '' : `  (got ${got}, want ${want})`));
  }
  console.log(`  ink: uniform=${(inkRatio(uniform) * 100).toFixed(3)}%  flat-bar=${(inkRatio(flatBar) * 100).toFixed(3)}%  flat-bar bytes=${fs.statSync(flatBar).size}`);
  try { fs.rmSync(tmp, { recursive: true, force: true }) } catch (e) {}
  process.exit(ok ? 0 : 1);
}

function inkRatio(file) {
  let PNG;
  try { PNG = require('pngjs').PNG } catch (e) {
    try { PNG = require(path.join(__dirname, 'node_modules', 'pngjs')).PNG } catch (e2) { return null }
  }
  try {
    const img = PNG.sync.read(fs.readFileSync(file));
    const { width: w, height: h, data } = img;
    const step = Math.max(1, Math.floor(Math.sqrt((w * h) / 40000)));   // ~40k samples max, enough for a ratio
    const bucket = new Map(); const px = [];
    for (let y = 0; y < h; y += step) for (let x = 0; x < w; x += step) {
      const i = (y * w + x) * 4;
      const q = ((data[i] >> 3) << 10) | ((data[i + 1] >> 3) << 5) | (data[i + 2] >> 3);  // 5-bit/channel key
      bucket.set(q, (bucket.get(q) || 0) + 1);
      px.push([data[i], data[i + 1], data[i + 2]]);
    }
    let modal = 0, best = -1;
    for (const [q, n] of bucket) if (n > best) { best = n; modal = q }
    const mr = ((modal >> 10) & 31) << 3, mg = ((modal >> 5) & 31) << 3, mb = (modal & 31) << 3;
    let ink = 0;
    for (const [r, g, b] of px) if (Math.abs(r - mr) > 12 || Math.abs(g - mg) > 12 || Math.abs(b - mb) > 12) ink++;
    return px.length ? ink / px.length : null;
  } catch (e) { return null }
}
const run = (script, argv) => new Promise(res => {
  const r = CDP.spawnSync(process.execPath, [path.join(__dirname, script), ...argv], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  res({ code: r.status, out: (r.stdout || '').trim(), err: (r.stderr || '').trim() });
});

fs.mkdirSync(path.resolve(outDir), { recursive: true });

// ---------- all breakpoint shots in ONE browser launch ----------
async function captureAll() {
  const port = basePort;
  const PROF = path.join(os.tmpdir(), 'wf-cdp-prof' + port);
  const p = CDP.spawn(CHROME, ['--headless=new', '--disable-gpu', '--remote-debugging-port=' + port,
    '--remote-allow-origins=*', '--no-first-run', '--allow-file-access-from-files', '--user-data-dir=' + PROF, 'about:blank']);
  const get = q => new Promise((res, rej) => { http.get({ host: '127.0.0.1', port, path: q }, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d))) }).on('error', rej) });
  try {
    let list; for (let i = 0; i < 60; i++) { try { list = await get('/json/list'); if (list && list.length) break } catch (e) {} await wait(200) }
    if (!list || !list.length) throw new Error('chrome did not start');
    const t = list.find(x => x.type === 'page');
    const sock = new WebSocket(t.webSocketDebuggerUrl, { headers: { Origin: 'http://localhost' } });
    let id = 0; const pend = {};
    sock.on('message', m => { const o = JSON.parse(m); if (o.id && pend[o.id]) pend[o.id](o.result) });
    await new Promise((r, j) => { sock.on('open', r); sock.on('error', j) });
    const cmd = (method, params) => new Promise(r => { const i = ++id; pend[i] = r; sock.send(JSON.stringify({ id: i, method, params: params || {} })) });
    const evalJS = async e => { const r = await cmd('Runtime.evaluate', { expression: e, returnByValue: true }); return r && r.result ? r.result.value : null };
    await cmd('Page.enable'); await cmd('Runtime.enable');

    const shots = [];
    for (const W of widths) {
      const mob = mobileSet.has(W);
      await cmd('Emulation.setDeviceMetricsOverride', { width: W, height: mob ? 844 : 1000, deviceScaleFactor: 2, mobile: mob });
      await cmd('Page.navigate', { url });           // reload per width: real layout, real load animations
      await wait(4800);
      // defeat a load-animation that parks content at opacity:0 (Webflow IX2 initial state)
      await evalJS("document.querySelectorAll('*').forEach(function(e){var s=getComputedStyle(e);if(+s.opacity===0)e.style.opacity=1});");
      await wait(400);
      const raw = await evalJS(`(function(){var e=document.querySelector(${JSON.stringify(sel)});if(!e)return "null";
        var r=e.getBoundingClientRect();return JSON.stringify({top:Math.max(0,Math.round(r.top+window.scrollY)),h:Math.round(r.height),w:Math.round(r.width)})})()`);
      const box = raw && raw !== 'null' ? JSON.parse(raw) : null;
      if (!box || box.h < 1) { shots.push({ width: W, error: 'selector not found or zero-height' }); continue }
      const shot = await cmd('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: 0, y: box.top, width: W, height: Math.min(box.h, 4000), scale: 1 } });
      const file = path.join(outDir, `${section}-${W}.png`);
      fs.writeFileSync(file, Buffer.from(shot.data, 'base64'));
      const bytes = fs.statSync(file).size;
      const ink = inkRatio(file);
      shots.push({ width: W, mobile: mob, file, bytes, box, ink, blank: ink !== null ? ink < 0.001 : bytes < 7000 });
      // machine-checked overflow, so "no horizontal scroll" is measured, never eyeballed
      shots[shots.length - 1].overflow = await evalJS('document.documentElement.scrollWidth > document.documentElement.clientWidth + 2');
    }
    try { sock.close() } catch (e) {}
    return shots;
  } finally { try { p.kill() } catch (e) {} }
}

(async () => {
  const report = { section, url, selector: sel, widths, verdict: 'PASS', shots: [], scores: [], audits: [], states: null, fails: [], warns: [] };

  let shots;
  try { shots = await captureAll(); }
  catch (e) { console.error('ERR capture: ' + e.message); process.exit(2); }
  report.shots = shots;

  for (const s of shots) {
    if (s.error) report.fails.push(`capture @${s.width}: ${s.error}`);
    else if (s.blank) report.fails.push(`capture @${s.width}: blank shot (${s.ink !== null && s.ink !== undefined ? (s.ink * 100).toFixed(3) + '% non-background pixels' : s.bytes + 'B'}) — wrong clip, unpublished page, or content hidden`);
    if (s.overflow) report.fails.push(`horizontal overflow @${s.width} — scrollWidth exceeds viewport`);
  }

  // ---------- score every width that has a reference ----------
  if (refDir) {
    for (const s of shots) {
      if (s.error || s.blank) continue;
      const cands = [path.join(refDir, `${section}-${s.width}.png`), path.join(refDir, `${section}--${s.width}.png`), path.join(refDir, `${section}.png`)];
      const ref = cands.find(fs.existsSync);
      if (!ref) {
        report.scores.push({ width: s.width, verdict: 'UNSCORED', reason: `no reference (looked for ${section}-${s.width}.png)` });
        if (unscoredOk.includes(s.width)) report.warns.push(`@${s.width} UNSCORED (declared): ${unscoredReason} — invariants only, never reported as a score`);
        else report.fails.push(`@${s.width} UNSCORED and NOT declared — either supply ${section}-${s.width}.png or declare it: --unscored-ok=${s.width} --unscored-reason="the source has no frame at this width" (Rule G)`);
        continue;
      }
      const r = await run('pixel-diff.js', [ref, s.file, path.join(outDir, `${section}-${s.width}-diff.png`), '--json', `--min=${MIN}`, `--cell=${CELL}`, `--height=${HEIGHT}`]);
      let j = null; try { j = JSON.parse(r.out) } catch (e) {}
      if (!j) { report.scores.push({ width: s.width, verdict: 'ERROR', reason: r.err || 'pixel-diff produced no JSON' }); report.fails.push(`@${s.width} score could not be computed: ${r.err || 'no output'}`); continue }
      report.scores.push({ width: s.width, verdict: j.verdict, match: j.match, heightDeltaPct: j.heightDeltaPct, hotCells: j.hotCells, worst: j.worst, ref, fails: j.fails });
      j.fails.forEach(f => report.fails.push(`@${s.width} ${f}`));
    }
  } else report.fails.push('no --ref given: shots were captured but NOTHING was scored. A section cannot be ' +
    'verified without a comparison — this used to be a warning while the verdict still read PASS, which is how ' +
    'a header shipped at 1.4% of its reference (v2.1.11). Pass --ref=<dir of reference shots>, or declare the ' +
    'absence explicitly with --unscored-ok=<widths> --unscored-reason="<why the reference has no such frame>".');

  // ---------- a11y + perf ----------
  if (doAudit) {
    const primary = widths[0], smallest = widths[widths.length - 1];
    for (const W of [primary, smallest].filter((v, i, a) => a.indexOf(v) === i)) {
      const r = await run('page-audit.js', [url, path.join(outDir, `${section}-audit-${W}.json`), String(W), sel, mobileSet.has(W) ? '1' : '0', String(basePort + 40 + W % 17)]);
      let j = null; try { j = JSON.parse(fs.readFileSync(path.join(outDir, `${section}-audit-${W}.json`), 'utf8')) } catch (e) {}
      if (!j) { report.audits.push({ width: W, verdict: 'ERROR', reason: r.err || 'no audit json' }); report.fails.push(`a11y/perf @${W} did not run: ${r.err || 'no output'}`); continue }
      report.audits.push({ width: W, verdict: j.verdict, a11y: j.a11y, perf: j.perf, fails: j.fails, warns: j.warns });
      j.fails.forEach(f => report.fails.push(`a11y/perf @${W} ${f}`));
      (j.warns || []).forEach(w => report.warns.push(`a11y/perf @${W} ${w}`));
    }
  }

  // ---------- interaction states at the primary width ----------
  if (states) {
    const r = await run('state-shot.js', [url, path.join(outDir, `${section}-state`), String(widths[0]), sel, String(states), mobileSet.has(widths[0]) ? '1' : '0', String(basePort + 70)]);
    let j = null; try { j = JSON.parse(r.out) } catch (e) {}
    report.states = j ? { captured: j.states.map(s => s.state), unverified: j.unverifiedStates || null, blank: j.blankWarning } : { error: r.err || 'state-shot produced no JSON' };
    if (!j) report.fails.push(`state capture failed: ${r.err || 'no output'}`);
    else {
      if (j.unverifiedStates) report.warns.push(j.unverifiedStates);
      (j.blankWarning || []).forEach(s => report.fails.push(`state "${s}" captured blank`));
    }
  }

  const measured = report.scores.some(x => x.verdict === 'PASS' || x.verdict === 'FAIL');
  const anchorOk = anchorSeen.length >= 12;
  report.anchor = { seen: anchorOk, note: anchorSeen || null };
  report.verdict = decideVerdict(report.fails.length, measured, anchorOk);
  if (report.verdict === 'UNVERIFIED') report.fails.push('nothing was scored at any width — UNVERIFIED is not PASS');
  else if (report.verdict === 'PASS-PENDING-ANCHOR') {
    const P = widths[0];
    const built = path.join(outDir, `${section}-${P}.png`);
    const refShot = (report.scores.find(x => x.width === P) || {}).ref || '(the reference shot for the primary width)';
    report.fails.push('every score passed, but the ANCHOR VIEW is not recorded — and a clean score has hidden a ' +
      'whole missing text line before (98.75%, zero hot regions, property equality 158/158). Open these two side ' +
      'by side:' + '\n' + '              built: ' + built + '\n' + '              ref:   ' + refShot + '\n' +
      '            then re-run with --anchor-seen="<what the comparison actually showed>". ' +
      'Describe what you saw, not that you looked; if it revealed a diff, fix it instead and re-verify.');
  }
  const jsonPath = path.join(outDir, `${section}-verify.json`);
  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));

  if (asJson) { console.log(JSON.stringify(report, null, 2)); process.exit(report.verdict === 'PASS' ? 0 : 1) }

  console.log(`EVIDENCE verify-section — ${report.verdict}   ${section}   ${url}  [${sel}]`);
  for (const s of report.shots) {
    const sc = report.scores.find(x => x.width === s.width);
    const bits = [`@${String(s.width).padEnd(4)}`];
    bits.push(s.error ? `CAPTURE ERROR: ${s.error}` : `${s.box.w}x${s.box.h}px ${Math.round(s.bytes / 1024)}KB${s.blank ? ' BLANK' : ''}${s.overflow ? ' OVERFLOW' : ''}`);
    if (sc) bits.push(sc.verdict === 'UNSCORED' ? 'UNSCORED (no ref)' : sc.verdict === 'ERROR' ? `SCORE ERROR: ${sc.reason}` : `${sc.verdict} match ${sc.match}% · height Δ${sc.heightDeltaPct}% · hot regions ${sc.hotCells.length}`);
    console.log('  ' + bits.join('  ·  '));
    if (sc && sc.hotCells && sc.hotCells.length) sc.hotCells.slice(0, 3).forEach(c => console.log(`        hot: ${c.where} (${c.box}) ${c.pct}% of cell`));
  }
  report.audits.forEach(a => console.log(`  a11y/perf @${a.width}: ${a.verdict}` + (a.a11y ? ` — contrast ${a.a11y.contrastChecked - a.a11y.contrastFailed}/${a.a11y.contrastChecked} · unnamed ${a.a11y.missingName} · alt-missing ${a.a11y.imagesMissingAlt} · images ${a.perf.imageKBTotal}KB · depth ${a.perf.domDepth} · CLS ${a.perf.cls}` : ` (${a.reason})`)));
  if (report.states) console.log(`  states: ${report.states.error ? 'ERROR ' + report.states.error : report.states.captured.join(', ')}`);
  if (report.anchor && report.anchor.seen) console.log(`  anchor: seen — ${report.anchor.note}`);
  report.fails.forEach(f => console.log(`  FAIL: ${f}`));
  report.warns.forEach(w => console.log(`  warn: ${w}`));
  console.log(`VERDICT: ${report.verdict}   → ${jsonPath}`);
  process.exit(report.verdict === 'PASS' ? 0 : 1);
})().catch(e => { console.error('ERR ' + e.message); process.exit(2) });
