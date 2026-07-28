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
//     --min=97 --cell=25 --height=2   pixel-diff thresholds (defaults = the strict gate)
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
if (!url || !sel || !outDir) {
  console.error('usage: node verify-section.js <url> <selector> <outDir> [--section= --widths= --ref= --states= --audit --min= --cell= --height= --json]');
  process.exit(2);
}
const section = flag('section', sel.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'section');
const widths = String(flag('widths', '1440,991,767,390')).split(',').map(Number).filter(Boolean);
const mobileSet = new Set(String(flag('mobile', '767,390')).split(',').map(Number));
const refDir = flag('ref', null);
const states = flag('states', null);
const doAudit = !!flag('audit', false);
const MIN = flag('min', '97'), CELL = flag('cell', '25'), HEIGHT = flag('height', '2');
const asJson = !!flag('json', false);
const basePort = 9400 + (process.pid % 120);

const wait = ms => new Promise(r => setTimeout(r, ms));
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
      shots.push({ width: W, mobile: mob, file, bytes, box, blank: bytes < 7000 });
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
    else if (s.blank) report.fails.push(`capture @${s.width}: blank shot (${s.bytes}B) — wrong clip, unpublished page, or content hidden`);
    if (s.overflow) report.fails.push(`horizontal overflow @${s.width} — scrollWidth exceeds viewport`);
  }

  // ---------- score every width that has a reference ----------
  if (refDir) {
    for (const s of shots) {
      if (s.error || s.blank) continue;
      const cands = [path.join(refDir, `${section}-${s.width}.png`), path.join(refDir, `${section}--${s.width}.png`), path.join(refDir, `${section}.png`)];
      const ref = cands.find(fs.existsSync);
      if (!ref) { report.scores.push({ width: s.width, verdict: 'UNSCORED', reason: `no reference (looked for ${section}-${s.width}.png)` }); report.warns.push(`@${s.width} UNSCORED — no reference frame; derived values, state it in the report`); continue }
      const r = await run('pixel-diff.js', [ref, s.file, path.join(outDir, `${section}-${s.width}-diff.png`), '--json', `--min=${MIN}`, `--cell=${CELL}`, `--height=${HEIGHT}`]);
      let j = null; try { j = JSON.parse(r.out) } catch (e) {}
      if (!j) { report.scores.push({ width: s.width, verdict: 'ERROR', reason: r.err || 'pixel-diff produced no JSON' }); report.fails.push(`@${s.width} score could not be computed: ${r.err || 'no output'}`); continue }
      report.scores.push({ width: s.width, verdict: j.verdict, match: j.match, heightDeltaPct: j.heightDeltaPct, hotCells: j.hotCells, worst: j.worst, ref, fails: j.fails });
      j.fails.forEach(f => report.fails.push(`@${s.width} ${f}`));
    }
  } else report.warns.push('no --ref given: shots captured but NOT scored — this is not a verified section');

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

  report.verdict = report.fails.length ? 'FAIL' : 'PASS';
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
  report.fails.forEach(f => console.log(`  FAIL: ${f}`));
  report.warns.forEach(w => console.log(`  warn: ${w}`));
  console.log(`VERDICT: ${report.verdict}   → ${jsonPath}`);
  process.exit(report.verdict === 'PASS' ? 0 : 1);
})().catch(e => { console.error('ERR ' + e.message); process.exit(2) });
