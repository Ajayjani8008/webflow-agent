// dom-contract.js — PROPERTY-EQUALITY gate. The primary accuracy gate since v1.11.0.
//
// Why this exists: a pixel percentage cannot see a wrong value that covers little area.
// Measured on a real build: a header scored 99.11% "PASS" while its reference had the wrong
// backdrop entirely, and a 6.8px line was 50% too wide. Both invisible to a pixel score.
// Conversely, glyph rasterisation differs between Figma and Chrome on EVERY text edge, so a
// global pixel score can never reach 100% no matter how correct the build is.
// So: compare VALUES, exhaustively, and let pixels be a coarse safety net.
//
// It is also the cheapest gate that exists — it reads numbers, never images. An opened PNG
// costs 5k-66k tokens (measured); this returns a few hundred.
//
// Usage:
//   node dom-contract.js verify <url> <contract.json> [--width=1920] [--mobile] [--port=9290] [--json]
//   node dom-contract.js emit   <url> <rootSelector> <out.json> [--width=1920] [--props=a,b,c]
//
// verify → exit 0 only if EVERY expected property matches. Exit 1 on any deviation, 2 on setup error.
// emit   → snapshots the subtree's computed values, to bootstrap a contract or catch regressions.
//
// Contract shape:
//   { "section": "example-hero", "width": 1920,
//     "elements": [ { "sel": ".example-hero__title", "expect": {
//                       "font-family": "Yrsa", "font-size": "70px", "line-height": "80px",
//                       "color": "#6C461A", "box": { "w": 1035 } } } ] }
//
// Value matching is intentionally forgiving about FORM and strict about MEANING:
//   colors     — any CSS form; compared as rgba tuples ("#6C461A" == "rgb(108, 70, 26)")
//   lengths    — "70px" == "70" == 70; tolerance ±0.5px absorbs sub-pixel layout only
//   font-family— matches if the expected family is the FIRST resolved family (fallback = FAIL,
//                which is the point: a silently substituted font is the classic invisible defect)
//   box        — w/h/x/y from getBoundingClientRect, ±0.5px, relative to the section root
// Anything else is compared as a normalised string.
const http = require('http'); const CDPP = require('child_process'); const fs = require('fs');
const os = require('os'); const path = require('path');
let WebSocket; try { WebSocket = require('ws') } catch (e) {
  try { WebSocket = require(path.join(__dirname, '..', 'node_modules', 'ws')) }
  catch (e2) { WebSocket = require(path.join(os.homedir(), 'node_modules', 'ws')) }
}
const CHROME = process.platform === 'darwin' ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  : process.platform === 'win32' ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : 'google-chrome';

const argv = process.argv.slice(2);
const pos = argv.filter(a => !a.startsWith('--'));
const flag = (n, d) => { const f = argv.find(x => x === `--${n}` || x.startsWith(`--${n}=`)); return f === undefined ? d : (f.includes('=') ? f.split('=').slice(1).join('=') : true); };
const mode = pos[0];
// WIDTH: the contract records the viewport it was captured at. Comparing a 1440-captured contract against a
// 1920 render reports every wrapped-text height as a DEVIATION that is pure artifact — measured 2026-08-22, ten
// false deviations on a correct build. So an explicit --width wins, else the contract's own width, else 1920.
let W = flag('width', null) === null ? null : +flag('width', 1920);
const MOB = !!flag('mobile', false), PORT = +flag('port', 9290), JSONOUT = !!flag('json', false);
if (!['verify', 'emit'].includes(mode)) {
  console.error('usage: node dom-contract.js verify <url> <contract.json> [--width= --mobile --port= --json]');
  console.error('       node dom-contract.js emit   <url> <rootSelector> <out.json> [--width= --props=]');
  process.exit(2);
}

// ---------- value normalisation ----------
const NAMED = { transparent: [0, 0, 0, 0], white: [255, 255, 255, 1], black: [0, 0, 0, 1] };
function toRGBA(v) {
  if (v == null) return null;
  const s = String(v).trim().toLowerCase();
  if (NAMED[s]) return NAMED[s];
  let m = s.match(/^#([0-9a-f]{3,8})$/);
  if (m) {
    let h = m[1];
    if (h.length === 3) h = h.split('').map(c => c + c).join('');
    if (h.length === 4) h = h.split('').map(c => c + c).join('');
    const n = parseInt(h.slice(0, 6), 16);
    const a = h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1;
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255, a];
  }
  m = s.match(/^rgba?\(([^)]+)\)$/);
  if (m) {
    const p = m[1].split(/[,\s/]+/).filter(Boolean).map(Number);
    return [p[0] | 0, p[1] | 0, p[2] | 0, p.length > 3 ? p[3] : 1];
  }
  return null;
}
const isLen = v => /^-?\d*\.?\d+(px)?$/.test(String(v).trim());
const num = v => parseFloat(String(v));
const firstFamily = v => String(v || '').split(',')[0].trim().replace(/^["']|["']$/g, '').toLowerCase();

function compare(prop, expect, actual) {
  if (expect == null) return { ok: true };
  const e = String(expect).trim(), a = String(actual == null ? '' : actual).trim();
  if (prop === 'font-family') {
    const ok = firstFamily(a) === firstFamily(e);
    return { ok, why: ok ? '' : `resolved to "${a}" — expected "${e}" first (fallback in use)` };
  }
  const er = toRGBA(e), ar = toRGBA(a);
  if (er && ar) {
    const ok = er[0] === ar[0] && er[1] === ar[1] && er[2] === ar[2] && Math.abs(er[3] - ar[3]) < 0.02;
    return { ok, why: ok ? '' : `${a} != ${e}` };
  }
  if (isLen(e) && isLen(a)) {
    const d = Math.abs(num(e) - num(a));
    return { ok: d <= 0.5, why: d <= 0.5 ? '' : `${a} != ${e} (Δ${d.toFixed(2)}px)` };
  }
  const norm = s => s.replace(/\s+/g, ' ').toLowerCase();
  const ok = norm(e) === norm(a);
  return { ok, why: ok ? '' : `"${a}" != "${e}"` };
}

// ---------- chrome ----------
const wait = ms => new Promise(r => setTimeout(r, ms));
const get = p2 => new Promise((res, rej) => { http.get({ host: '127.0.0.1', port: PORT, path: p2 }, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d))) }).on('error', rej) });

(async () => {
  const url = pos[1];
  if (!url) { console.error('ERR url required'); process.exit(2) }
  const PROF = path.join(os.tmpdir(), 'wf-cdp-prof-dc' + PORT);
  const chrome = CDPP.spawn(CHROME, ['--headless=new', '--disable-gpu', '--remote-debugging-port=' + PORT,
    '--remote-allow-origins=*', '--no-first-run', '--allow-file-access-from-files',
    '--force-color-profile=srgb', '--user-data-dir=' + PROF, 'about:blank'], { stdio: 'ignore' });
  const bail = (code, msg) => { if (msg) console.error(msg); try { chrome.kill() } catch (e) { } process.exit(code) };

  let list; for (let i = 0; i < 60; i++) { try { list = await get('/json/list'); if (list && list.length) break } catch (e) { } await wait(200) }
  if (!list || !list.length) bail(2, 'ERR chrome did not expose a debugging target');
  const target = list.find(x => x.type === 'page');
  const sock = new WebSocket(target.webSocketDebuggerUrl, { headers: { Origin: 'http://localhost' } });
  let id = 0; const pend = {};
  sock.on('message', m => { const o = JSON.parse(m); if (o.id && pend[o.id]) pend[o.id](o.result) });
  await new Promise((r, j) => { sock.on('open', r); sock.on('error', j) });
  const cmd = (method, params) => new Promise(r => { const i = ++id; pend[i] = r; sock.send(JSON.stringify({ id: i, method, params: params || {} })) });
  const evalJS = async expr => {
    const r = await cmd('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r && r.exceptionDetails) return { __err: r.exceptionDetails.text || 'eval error' };
    return r && r.result ? r.result.value : null;
  };
  await cmd('Page.enable'); await cmd('Runtime.enable');
  await cmd('Emulation.setDeviceMetricsOverride', { width: W, height: MOB ? 844 : 1000, deviceScaleFactor: 1, mobile: !!MOB });
  await cmd('Page.navigate', { url });
  await wait(1200);
  // wait for webfonts so font metrics are real, not fallback-measured
  await evalJS('document.fonts && document.fonts.ready ? document.fonts.ready.then(()=>1) : 1');
  await wait(2200);

  const READ = `(function(sels, props, rootSel){
    var root = rootSel ? document.querySelector(rootSel) : null;
    var rb = root ? root.getBoundingClientRect() : {left:0, top:0};
    var out = {};
    sels.forEach(function(sel){
      var els = document.querySelectorAll(sel);
      if(!els.length){ out[sel] = null; return; }
      var e = els[0], cs = getComputedStyle(e), r = e.getBoundingClientRect();
      var o = { __count: els.length, __box: {
        w: +(r.width).toFixed(2), h: +(r.height).toFixed(2),
        x: +(r.left - rb.left).toFixed(2), y: +(r.top - rb.top).toFixed(2) } };
      props.forEach(function(p){ o[p] = cs.getPropertyValue(p); });
      out[sel] = o;
    });
    return JSON.stringify(out);
  })`;

  if (mode === 'emit') {
    const rootSel = pos[2], outFile = pos[3];
    if (!rootSel || !outFile) bail(2, 'ERR emit needs <rootSelector> <out.json>');
    const DEF = (flag('props', '') || '').split(',').filter(Boolean);
    const props = DEF.length ? DEF : ['display', 'position', 'width', 'height', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
      'padding-top', 'padding-right', 'padding-bottom', 'padding-left', 'font-family', 'font-size', 'font-weight', 'line-height',
      'letter-spacing', 'color', 'background-color', 'text-align', 'text-transform', 'flex-direction', 'align-items',
      'justify-content', 'row-gap', 'column-gap', 'border-top-left-radius', 'border-top-right-radius',
      'border-bottom-left-radius', 'border-bottom-right-radius', 'opacity', 'z-index', 'overflow', 'white-space'];
    const sels = JSON.parse(await evalJS(`(function(){
      var root=document.querySelector(${JSON.stringify(rootSel)}); if(!root) return "[]";
      var set=[], seen={};
      root.querySelectorAll('*').forEach(function(e){
        if(!e.className || typeof e.className!=='string') return;
        e.className.trim().split(/\\s+/).forEach(function(c){
          if(!c || c.indexOf('w-')===0) return;
          var s='.'+c; if(!seen[s]){ seen[s]=1; set.push(s); }
        });
      });
      return JSON.stringify(set);
    })()`) || '[]');
    const data = JSON.parse(await evalJS(`${READ}(${JSON.stringify(sels)},${JSON.stringify(props)},${JSON.stringify(rootSel)})`) || '{}');
    const contract = {
      section: path.basename(outFile).replace(/\..*$/, ''), url, width: W, root: rootSel,
      generated: 'emit — SNAPSHOT of the built page, NOT design truth. Replace values with Figma values before using as a gate.',
      elements: Object.entries(data).filter(([, v]) => v).map(([sel, v]) => {
        const expect = {}; props.forEach(p => { if (v[p] !== '' && v[p] != null) expect[p] = v[p] });
        return { sel, count: v.__count, box: v.__box, expect };
      })
    };
    fs.mkdirSync(path.dirname(path.resolve(outFile)), { recursive: true });
    fs.writeFileSync(outFile, JSON.stringify(contract, null, 1));
    console.log(`emitted ${contract.elements.length} selector(s) -> ${outFile}`);
    return bail(0);
  }

  // ---------- verify ----------
  const cFile = pos[2];
  if (!cFile || !fs.existsSync(cFile)) bail(2, 'ERR contract not found: ' + cFile);
  const contract = JSON.parse(fs.readFileSync(cFile, 'utf8'));
  if (W === null) {
    W = +contract.width || 1920;
    if (contract.width) console.log('  width     ' + W + 'px   (inherited from the contract; pass --width to override)');
    else console.log('  width     1920px  (contract records no width — pass --width=<reference frame> to compare like with like)');
  }
  const els = contract.elements || [];
  const propSet = [...new Set(els.flatMap(e => Object.keys(e.expect || {}).filter(k => k !== 'box')))];
  const sels = els.map(e => e.sel);
  // A page that never loaded returns nothing, which used to parse to {} and surface as EVERY selector
  // "not present on the page" — indistinguishable from a real build defect, and it happened for real on
  // 2026-08-22 when a concurrent verify run held the debug port. Ten selectors do not vanish at once; that
  // is the page failing to load. Say so, and exit as an ERROR rather than a measured FAIL, because a FAIL
  // means "the build is wrong" and this is "nothing was measured".
  const raw = await evalJS(`${READ}(${JSON.stringify(sels)},${JSON.stringify(propSet)},${JSON.stringify(contract.root || null)})`);
  let data;
  try { data = JSON.parse(raw || '{}'); } catch (e) { data = {}; }

  const fails = []; const missing = []; let checked = 0;
  for (const e of els) {
    const got = data[e.sel];
    if (!got) { missing.push(e.sel); continue; }
    if (e.count != null && got.__count !== e.count) {
      fails.push({ sel: e.sel, prop: 'count', why: `${got.__count} element(s) on page, expected ${e.count}` });
    }
    for (const [prop, exp] of Object.entries(e.expect || {})) {
      if (prop === 'box') {
        for (const [k, v] of Object.entries(exp)) {
          checked++;
          const d = Math.abs(num(v) - num(got.__box[k]));
          if (!(d <= 0.5)) fails.push({ sel: e.sel, prop: 'box.' + k, why: `${got.__box[k]} != ${v} (Δ${d.toFixed(2)}px)` });
        }
        continue;
      }
      checked++;
      const r = compare(prop, exp, got[prop]);
      if (!r.ok) fails.push({ sel: e.sel, prop, why: r.why });
    }
  }
  // EVERY selector missing is not a build with ten absent elements — it is the page not loading, or
  // the wrong page. Seen for real on 2026-08-22 when a drafted page 404'd and when a concurrent verify
  // held the debug port: both printed ten MISSING lines that read exactly like a broken build. A FAIL
  // means "the build is wrong"; this means "nothing was measured", so it exits as an ERROR.
  if (els.length >= 3 && missing.length === els.length) {
    bail(2, 'ERR every expected selector was absent — this is a LOAD or WRONG-PAGE failure, not a build defect.' + '\n' +
      '    url: ' + url + '\n' +
      '    check, in this order: the page is published and not a draft (a drafted page 404s) · the debug' + '\n' +
      '    port is free (pass --port=<n>; a concurrent verify run holds the default) · the URL resolves.');
  }

  const verdict = (fails.length === 0 && missing.length === 0) ? 'PASS' : 'FAIL';
  if (JSONOUT) {
    console.log(JSON.stringify({ section: contract.section, width: W, verdict, checked, fails, missing }, null, 1));
  } else {
    console.log(`EVIDENCE dom-contract — ${verdict}   ${contract.section || path.basename(cFile)}   @${W}   ${els.length} selector(s), ${checked} propert${checked === 1 ? 'y' : 'ies'} checked`);
    for (const s of missing) console.log(`  MISSING  ${s} — selector not present on the page`);
    for (const f of fails) console.log(`  DEVIATION  ${f.sel}  ${f.prop}: ${f.why}`);
    if (verdict === 'PASS') console.log('  every expected property equals the contract');
  }
  bail(verdict === 'PASS' ? 0 : 1);
})().catch(e => { console.error('ERR ' + (e && e.message || e)); process.exit(2) });
