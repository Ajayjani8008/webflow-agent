// Interaction-STATE screenshots for Webflow behaviour parity (reference HTML/URL vs built page).
// Captures the same element in several states so hover/scroll/click effects can be compared side by side,
// not just the resting layout. Works on http(s) AND local files (file:///abs/path/ref.html).
//
// Usage: node state-shot.js <url> <outPrefix> <W> <rootSelector> <states> <mobile:1|0> <port>
//   states = comma list, any of:
//     base                     resting shot (always captured first)
//     auto[:N]                 hover every interactive descendant, cap N (default 6, DOM order).
//                              Anything past the cap is listed in `unverifiedStates` + a WARN on stderr —
//                              an unhovered element is an UNVERIFIED state, never an absent one.
//     hover:<cssSelector>      real mouse-move hover onto that element
//     focus:<cssSelector>      keyboard focus (:focus / :focus-visible)
//     click:<cssSelector>      real click, then settle
//     scroll:<0-100>           scroll page to N% of scrollable height (scroll reveals / parallax / sticky)
//     wait:<ms>                extra settle before the NEXT state (loading / entrance animations)
//   e.g. reference: node state-shot.js "file:///Users/x/ref/index.html" ref/hero 1440 ".hero" "base,auto,scroll:30" 0 9271
//        built:     node state-shot.js "https://x.webflow.io/" built/hero 1440 ".hero" "base,auto,scroll:30" 0 9272
//
// Writes <outPrefix>-<state>.png per state + <outPrefix>-states.json (index + per-state element box).
// Feed matching pairs to pixel-diff.js — same state, same width, one score per state.
// Needs ws (npm i ws --no-save at home dir) + Google Chrome. Unique port per run.
const CDP = require('child_process'); const http = require('http'); const fs = require('fs');
const os = require('os'); const path = require('path');
let WebSocket; try { WebSocket = require('ws') } catch (e) { WebSocket = require(path.join(os.homedir(), 'node_modules', 'ws')) }
const CHROME = process.platform === 'darwin' ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  : process.platform === 'win32' ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : 'google-chrome';
const PROF = path.join(os.tmpdir(), 'wf-cdp-prof');
const url = process.argv[2], outPrefix = process.argv[3], W = +process.argv[4] || 1440,
  root = process.argv[5] || 'body', statesArg = process.argv[6] || 'base,auto',
  mob = process.argv[7] === '1', port = +process.argv[8] || 9271;
if (!url || !outPrefix) { console.error('usage: node state-shot.js <url> <outPrefix> <W> <rootSelector> <states> <mobile:1|0> <port>'); process.exit(1) }
const AUTO_SEL = 'a,button,[role="button"],input,textarea,select,[class*="btn"],[class*="button"],[class*="card"],[class*="nav"] a,li[class]';
const AUTO_MAX = 6;
const wait = ms => new Promise(r => setTimeout(r, ms));
const get = p2 => new Promise((res, rej) => { http.get({ host: '127.0.0.1', port, path: p2 }, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d))) }).on('error', rej) });
const p = CDP.spawn(CHROME, ['--headless=new', '--disable-gpu', '--remote-debugging-port=' + port, '--remote-allow-origins=*',
  '--no-first-run', '--allow-file-access-from-files', '--user-data-dir=' + PROF + port, 'about:blank']);
const slug = s => s.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').slice(0, 40).toLowerCase() || 'x';

(async () => {
  let list; for (let i = 0; i < 50; i++) { try { list = await get('/json/list'); if (list && list.length) break } catch (e) { } await wait(200) }
  const t = list.find(x => x.type === 'page');
  const sock = new WebSocket(t.webSocketDebuggerUrl, { headers: { Origin: 'http://localhost' } });
  let id = 0; const pend = {}; sock.on('message', m => { const o = JSON.parse(m); if (o.id && pend[o.id]) pend[o.id](o.result) });
  await new Promise((r, j) => { sock.on('open', r); sock.on('error', j) });
  const cmd = (method, params) => new Promise(r => { const i = ++id; pend[i] = r; sock.send(JSON.stringify({ id: i, method, params: params || {} })) });
  const evalJS = async expr => { const r = await cmd('Runtime.evaluate', { expression: expr, returnByValue: true }); return r && r.result ? r.result.value : null };

  await cmd('Page.enable'); await cmd('Runtime.enable');
  await cmd('Emulation.setDeviceMetricsOverride', { width: W, height: mob ? 844 : 1000, deviceScaleFactor: 2, mobile: mob });
  await cmd('Page.navigate', { url }); await wait(4500);   // let fonts, entrance + loading animations settle

  const rootBox = async () => JSON.parse(await evalJS(
    `(function(){var e=document.querySelector(${JSON.stringify(root)});if(!e)return "null";var r=e.getBoundingClientRect();
      return JSON.stringify({x:Math.max(0,Math.round(r.left+window.scrollX)),y:Math.max(0,Math.round(r.top+window.scrollY)),w:Math.round(r.width),h:Math.round(r.height)})})()`) || 'null');
  if (!await rootBox()) { console.error('ERR root selector not found: ' + root); p.kill(); process.exit(1) }

  const shots = [];
  let autoReport = null;
  const capture = async (name, meta) => {
    const b = await rootBox(); if (!b) return;
    const scrollY = await evalJS('window.scrollY') || 0;
    // full-element clip while resting; viewport-follow clip once the page is scrolled (parallax/sticky states)
    const clip = scrollY > 0
      ? { x: 0, y: scrollY, width: W, height: mob ? 844 : 1000, scale: 1 }
      : { x: 0, y: b.y, width: W, height: Math.min(b.h, 1600), scale: 1 };
    const shot = await cmd('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip });
    const file = `${outPrefix}-${name}.png`;
    fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
    fs.writeFileSync(file, Buffer.from(shot.data, 'base64'));
    shots.push(Object.assign({ state: name, file, bytes: fs.statSync(file).size, clip }, meta || {}));
  };

  const centerOf = async sel => JSON.parse(await evalJS(
    `(function(){var e=document.querySelector(${JSON.stringify(sel)});if(!e)return "null";e.scrollIntoView({block:'center'});
      var r=e.getBoundingClientRect();if(r.width<1||r.height<1)return "null";
      return JSON.stringify({x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)})})()`) || 'null');

  const hoverAt = async pt => {
    for (const type of ['mouseMoved', 'mouseMoved']) {  // two moves: enter, then settle inside
      await cmd('Input.dispatchMouseEvent', { type, x: pt.x, y: pt.y, button: 'none', buttons: 0, clickCount: 0 });
      await wait(120);
    }
    await wait(650);  // transition + hover keyframes finish
  };
  const unhover = async () => { await cmd('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 2, y: 2, button: 'none', buttons: 0 }); await wait(500) };
  const scrollTo = async pct => {
    await evalJS(`window.scrollTo(0, Math.round((document.body.scrollHeight-window.innerHeight)*${pct}/100))`);
    await wait(1200);  // scroll reveals / scrub
  };

  const requested = statesArg.split(',').map(s => s.trim()).filter(Boolean);
  await capture('base');

  for (const st of requested) {
    const [kind, ...rest] = st.split(':'); const arg = rest.join(':');
    try {
      if (kind === 'base') continue;
      if (kind === 'wait') { await wait(+arg || 500); continue }
      if (kind === 'scroll') { await scrollTo(+arg || 0); await capture('scroll-' + (+arg || 0)); await evalJS('window.scrollTo(0,0)'); await wait(600); continue }
      if (kind === 'focus') {
        await evalJS(`(function(){var e=document.querySelector(${JSON.stringify(arg)});if(e&&e.focus)e.focus()})()`); await wait(500);
        await capture('focus-' + slug(arg), { target: arg });
        await evalJS('document.activeElement&&document.activeElement.blur()'); await wait(300); continue;
      }
      if (kind === 'click') {
        const c = await centerOf(arg); if (!c) { shots.push({ state: 'click-' + slug(arg), error: 'not visible' }); continue }
        await cmd('Input.dispatchMouseEvent', { type: 'mousePressed', x: c.x, y: c.y, button: 'left', buttons: 1, clickCount: 1 });
        await cmd('Input.dispatchMouseEvent', { type: 'mouseReleased', x: c.x, y: c.y, button: 'left', buttons: 0, clickCount: 1 });
        await wait(900); await capture('click-' + slug(arg), { target: arg }); await unhover(); continue;
      }
      if (kind === 'hover') {
        const c = await centerOf(arg); if (!c) { shots.push({ state: 'hover-' + slug(arg), error: 'not visible' }); continue }
        await hoverAt(c); await capture('hover-' + slug(arg), { target: arg }); await unhover(); continue;
      }
      if (kind === 'auto') {
        const cap = Math.max(1, +arg || AUTO_MAX);           // auto:12 raises the cap; default unchanged
        const found = JSON.parse(await evalJS(
          `(function(){var r=document.querySelector(${JSON.stringify(root)});if(!r)return "[]";
            var seen=[],out=[];
            r.querySelectorAll(${JSON.stringify(AUTO_SEL)}).forEach(function(e){
              var b=e.getBoundingClientRect(); if(b.width<8||b.height<8) return;
              var sel = e.id ? '#'+CSS.escape(e.id)
                : (e.className && typeof e.className==='string' && e.className.trim())
                  ? e.tagName.toLowerCase()+'.'+e.className.trim().split(/\\s+/).map(function(c){return CSS.escape(c)}).join('.')
                  : e.tagName.toLowerCase();
              if(seen.indexOf(sel)>-1) return; seen.push(sel);   // one shot per distinct class signature
              out.push(sel);                                     // repeated class (.card ×6) → hovers the FIRST match, which is the parity check

            });
            return JSON.stringify(out)})()`) || '[]');
        const targets = found.slice(0, cap);
        const skipped = found.slice(cap);
        autoReport = { requestedCap: cap, interactiveFound: found.length, hovered: targets, skipped };
        for (const sel of targets) {
          const c = await centerOf(sel); if (!c) { shots.push({ state: 'hover-' + slug(sel), target: sel, auto: true, error: 'not visible' }); continue }
          await hoverAt(c); await capture('hover-' + slug(sel), { target: sel, auto: true }); await unhover();
        }
        continue;
      }
      shots.push({ state: st, error: 'unknown state kind' });
    } catch (e) { shots.push({ state: st, error: e.message }) }
  }

  const index = {
    url, root, width: W, mobile: mob, states: shots,
    blankWarning: shots.filter(s => s.bytes && s.bytes < 7000).map(s => s.state),
    auto: autoReport,
    // an unhovered interactive element is an UNVERIFIED state, not an absent one — name it explicitly
    unverifiedStates: autoReport && autoReport.skipped.length
      ? `${autoReport.skipped.length} interactive element(s) not hovered (cap ${autoReport.requestedCap} of ${autoReport.interactiveFound} found): ${autoReport.skipped.join(', ')} — re-run with auto:${autoReport.interactiveFound} or name them via hover:<sel> before scoring behaviour parity`
      : null
  };
  if (index.unverifiedStates) console.error('WARN ' + index.unverifiedStates);
  fs.writeFileSync(outPrefix + '-states.json', JSON.stringify(index, null, 2));
  console.log(JSON.stringify(index, null, 2));
  p.kill(); process.exit(0);
})().catch(e => { console.error('ERR', e.message); p.kill(); process.exit(1) });
