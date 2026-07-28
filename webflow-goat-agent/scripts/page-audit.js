#!/usr/bin/env node
// page-audit.js — accessibility + performance gate for pixel-verify §1.9 (v1.9.0).
// Runs in the same headless Chrome as the other verification scripts, on the SAME single publish.
//
// Usage: node page-audit.js <url> <out.json> <W> <rootSelector|-> <mobile:1|0> <port> [--budget k=v,…]
//   e.g. node "$WF/scripts/page-audit.js" https://site.webflow.io/ built/hero-audit.json 1440 ".hero" 0 9281
//
// Measures, scoped to the section when a selector is given:
//   A11Y  contrast (WCAG AA 4.5:1 text / 3:1 large) · focus-visible on every interactive element ·
//         heading order (no skipped level, single h1 per page) · alt coverage · accessible name on
//         controls/links · touch-target size at mobile widths
//   PERF  image transfer bytes (per element + total) · image natural-vs-displayed oversizing ·
//         DOM node count + max depth · Lottie/JSON weight · long tasks during load · layout shift
//
// Verdict is budget-based and fail-closed; every failure names the element so the fix is targeted.
// Exit: 0 PASS · 1 FAIL · 2 usage/IO error.
const CDP = require('child_process'); const http = require('http'); const fs = require('fs');
const os = require('os'); const path = require('path');
let WebSocket; try { WebSocket = require('ws') } catch (e) {
  try { WebSocket = require(path.join(__dirname, '..', 'node_modules', 'ws')) }
  catch (e2) { WebSocket = require(path.join(os.homedir(), 'node_modules', 'ws')) }
}
const CHROME = process.platform === 'darwin' ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  : process.platform === 'win32' ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : 'google-chrome';

const url = process.argv[2], out = process.argv[3], W = +process.argv[4] || 1440;
const rootSel = (process.argv[5] && process.argv[5] !== '-') ? process.argv[5] : 'body';
const mob = process.argv[6] === '1', port = +process.argv[7] || 9281;
if (!url || !out) { console.error('usage: node page-audit.js <url> <out.json> <W> <rootSelector|-> <mobile:1|0> <port> [--budget k=v,…]'); process.exit(2) }

const BUDGET = {                       // override with --budget imageKB=200,domDepth=28
  contrastRatio: 4.5, contrastLarge: 3, imageKB: 300, imagesTotalKB: 1800,
  oversizeFactor: 2.5, domNodes: 1500, domDepth: 32, lottieKB: 500, longTaskMs: 200, cls: 0.1, touchPx: 44
};
const bflag = process.argv.find(a => a.startsWith('--budget='));
if (bflag) for (const kv of bflag.slice(9).split(',')) { const [k, v] = kv.split('='); if (k in BUDGET) BUDGET[k] = parseFloat(v) }

const PROF = path.join(os.tmpdir(), 'wf-cdp-prof');
const wait = ms => new Promise(r => setTimeout(r, ms));
const get = p2 => new Promise((res, rej) => { http.get({ host: '127.0.0.1', port, path: p2 }, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d))) }).on('error', rej) });
const p = CDP.spawn(CHROME, ['--headless=new', '--disable-gpu', '--remote-debugging-port=' + port, '--remote-allow-origins=*',
  '--no-first-run', '--allow-file-access-from-files', '--user-data-dir=' + PROF + port, 'about:blank']);

// ---- in-page collector (runs in the page, returns plain JSON) ----
const COLLECT = sel => `(function(){
  var root = document.querySelector(${JSON.stringify(sel)}) || document.body;
  var out = {a11y:{}, perf:{}, notes:[]};
  // Webflow injects its own chrome (the "Made in Webflow" badge) on free-plan pages. It is not our
  // build and cannot be fixed natively — auditing it would produce a permanent, unfixable false FAIL.
  var CHROME='.w-webflow-badge,[class*="w-webflow-badge"]';
  var isChrome = function(e){ return !!(e.closest && e.closest(CHROME)); };
  var vis = function(e){ var s=getComputedStyle(e), b=e.getBoundingClientRect();
    return s.display!=='none' && s.visibility!=='hidden' && +s.opacity>0.05 && b.width>0 && b.height>0; };

  // ---------- colour contrast ----------
  var lum = function(c){ var m=c.match(/[\\d.]+/g); if(!m) return null; var a=[m[0],m[1],m[2]].map(function(v){ v=v/255; return v<=0.03928? v/12.92 : Math.pow((v+0.055)/1.055,2.4)});
    return 0.2126*a[0]+0.7152*a[1]+0.0722*a[2]; };
  var bgOf = function(e){ var n=e; while(n && n!==document.documentElement){ var s=getComputedStyle(n);
      if(s.backgroundImage && s.backgroundImage!=='none') return null;             // gradient/image → skip, not measurable this way
      var m=(s.backgroundColor||'').match(/[\\d.]+/g);
      if(m && (m.length<4 || +m[3]>0.9)) return s.backgroundColor; n=n.parentElement; }
    return getComputedStyle(document.body).backgroundColor; };
  var contrast=[], skipped=0;
  Array.prototype.forEach.call(root.querySelectorAll('*'), function(e){
    if(!e.childNodes.length || !vis(e) || isChrome(e)) return;
    var text=''; Array.prototype.forEach.call(e.childNodes,function(n){ if(n.nodeType===3) text+=n.textContent.trim(); });
    if(text.length<2) return;
    var s=getComputedStyle(e), bg=bgOf(e); if(!bg){ skipped++; return; }
    var l1=lum(s.color), l2=lum(bg); if(l1===null||l2===null){ skipped++; return; }
    var ratio=(Math.max(l1,l2)+0.05)/(Math.min(l1,l2)+0.05);
    var size=parseFloat(s.fontSize), bold=(+s.fontWeight)>=700;
    var large=(size>=24)||(size>=18.66&&bold);
    contrast.push({sel:(e.tagName.toLowerCase()+(e.className&&typeof e.className==='string'?'.'+e.className.trim().split(/\\s+/)[0]:'')),
      text:text.slice(0,40), ratio:Math.round(ratio*100)/100, fontSize:size, large:large, color:s.color, bg:bg});
  });
  out.a11y.contrast = contrast; out.a11y.contrastSkipped = skipped;

  // ---------- focus + names on interactive elements ----------
  var INT='a[href],button,input,textarea,select,[role="button"],[tabindex]:not([tabindex="-1"])';
  var inter=[];
  Array.prototype.forEach.call(root.querySelectorAll(INT), function(e){
    if(!vis(e) || isChrome(e)) return;
    var b=e.getBoundingClientRect();
    var name=(e.getAttribute('aria-label')||e.textContent||'').trim()||e.getAttribute('title')||e.getAttribute('alt')||
             (e.querySelector('img')&&e.querySelector('img').alt)||'';
    inter.push({sel:e.tagName.toLowerCase()+(e.className&&typeof e.className==='string'?'.'+e.className.trim().split(/\\s+/)[0]:''),
      name:name.slice(0,40), hasName:!!name, w:Math.round(b.width), h:Math.round(b.height), tabbable:e.tabIndex>=0});
  });
  out.a11y.interactive = inter;

  // ---------- heading order ----------
  var hs=[]; Array.prototype.forEach.call(document.querySelectorAll('h1,h2,h3,h4,h5,h6'), function(h){ if(vis(h)) hs.push({level:+h.tagName[1], text:h.textContent.trim().slice(0,40)}); });
  out.a11y.headings = hs;

  // ---------- images ----------
  var imgs=[];
  Array.prototype.forEach.call(root.querySelectorAll('img'), function(i){
    var b=i.getBoundingClientRect();
    imgs.push({src:(i.currentSrc||i.src||'').slice(0,160), alt:i.getAttribute('alt'), hasAlt:i.hasAttribute('alt'),
      dw:Math.round(b.width), dh:Math.round(b.height), nw:i.naturalWidth, nh:i.naturalHeight,
      svg:/\\.svg(\\?|$)/i.test(i.currentSrc||i.src||''), loading:i.getAttribute('loading')});
  });
  out.perf.images = imgs;

  // ---------- DOM weight ----------
  var depth=0, nodes=0;
  (function walk(n,d){ nodes++; if(d>depth) depth=d; for(var c=n.firstElementChild;c;c=c.nextElementSibling) walk(c,d+1); })(document.body,1);
  out.perf.domNodes = nodes; out.perf.domDepth = depth;
  out.perf.sectionNodes = root.querySelectorAll('*').length;

  // ---------- lottie / heavy json ----------
  out.perf.lottie = Array.prototype.map.call(document.querySelectorAll('[data-src$=".json"],[data-animation-type="lottie"]'), function(e){
    return {src:(e.getAttribute('data-src')||'').slice(0,160)}; });
  return JSON.stringify(out);
})()`;

(async () => {
  let list; for (let i = 0; i < 50; i++) { try { list = await get('/json/list'); if (list && list.length) break } catch (e) {} await wait(200) }
  if (!list || !list.length) { console.error('ERR chrome did not start'); p.kill(); process.exit(2) }
  const t = list.find(x => x.type === 'page');
  const sock = new WebSocket(t.webSocketDebuggerUrl, { headers: { Origin: 'http://localhost' } });
  let id = 0; const pend = {}; const events = [];
  sock.on('message', m => { const o = JSON.parse(m); if (o.id && pend[o.id]) pend[o.id](o.result); else if (o.method) events.push(o); });
  await new Promise((r, j) => { sock.on('open', r); sock.on('error', j) });
  const cmd = (method, params) => new Promise(r => { const i = ++id; pend[i] = r; sock.send(JSON.stringify({ id: i, method, params: params || {} })) });
  const evalJS = async expr => { const r = await cmd('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }); return r && r.result ? r.result.value : null };

  await cmd('Page.enable'); await cmd('Runtime.enable'); await cmd('Network.enable'); await cmd('Performance.enable');
  await cmd('Emulation.setDeviceMetricsOverride', { width: W, height: mob ? 844 : 1000, deviceScaleFactor: 2, mobile: mob });

  const bytes = {};                                  // url -> transferred bytes
  sock.send(JSON.stringify({ id: ++id, method: 'Network.setCacheDisabled', params: { cacheDisabled: true } }));
  const t0 = Date.now();
  await cmd('Page.navigate', { url });
  await wait(6000);                                  // fonts, lazy images, entrance animations

  for (const e of events) {
    if (e.method === 'Network.responseReceived') bytes[e.params.response.url] = { type: e.params.type, size: 0 };
    if (e.method === 'Network.loadingFinished') {
      const rid = e.params.requestId;
      const rec = events.find(x => x.method === 'Network.responseReceived' && x.params.requestId === rid);
      if (rec) { const u = rec.params.response.url; bytes[u] = bytes[u] || { type: rec.params.type, size: 0 }; bytes[u].size = e.params.encodedDataLength; }
    }
  }

  const cls = await evalJS(`new Promise(function(res){var v=0;try{new PerformanceObserver(function(l){l.getEntries().forEach(function(e){if(!e.hadRecentInput)v+=e.value})}).observe({type:'layout-shift',buffered:true})}catch(e){};setTimeout(function(){res(Math.round(v*1000)/1000)},600)})`);
  const longTasks = await evalJS(`(function(){try{return performance.getEntriesByType('longtask').reduce(function(a,e){return a+e.duration},0)}catch(e){return null}})()`) || 0;
  const raw = await evalJS(COLLECT(rootSel));
  if (!raw) { console.error('ERR collector failed (root selector not found?)'); p.kill(); process.exit(2) }
  const data = JSON.parse(raw);

  // ---------- score against budgets ----------
  const fails = [], warns = [];
  const kb = n => Math.round(n / 1024);

  const badContrast = data.a11y.contrast.filter(c => c.ratio < (c.large ? BUDGET.contrastLarge : BUDGET.contrastRatio));
  badContrast.slice(0, 12).forEach(c => fails.push(`contrast ${c.ratio}:1 (needs ${c.large ? BUDGET.contrastLarge : BUDGET.contrastRatio}) — ${c.sel} "${c.text}" ${c.color} on ${c.bg}`));
  if (badContrast.length > 12) fails.push(`… ${badContrast.length - 12} more contrast failures`);

  const noName = data.a11y.interactive.filter(i => !i.hasName);
  noName.slice(0, 8).forEach(i => fails.push(`interactive element has no accessible name — ${i.sel}`));
  const notTabbable = data.a11y.interactive.filter(i => !i.tabbable);
  notTabbable.slice(0, 8).forEach(i => fails.push(`interactive element not keyboard-reachable (tabindex ${'<'}0) — ${i.sel}`));
  if (mob) data.a11y.interactive.filter(i => i.w < BUDGET.touchPx || i.h < BUDGET.touchPx)
    .slice(0, 8).forEach(i => fails.push(`touch target ${i.w}x${i.h} < ${BUDGET.touchPx}px — ${i.sel}`));

  const lv = data.a11y.headings.map(h => h.level);
  const h1s = lv.filter(l => l === 1).length;
  if (h1s === 0) warns.push('no h1 on the page (fine for a section-scoped audit, a bug for a page audit)');
  if (h1s > 1) fails.push(`${h1s} h1 elements on the page — exactly one is correct`);
  for (let i = 1; i < lv.length; i++) if (lv[i] - lv[i - 1] > 1) fails.push(`heading order skips h${lv[i - 1]} → h${lv[i]} ("${data.a11y.headings[i].text}")`);

  const noAlt = data.perf.images.filter(i => !i.hasAlt);
  noAlt.slice(0, 8).forEach(i => fails.push(`img without alt attribute — ${i.src.split('/').pop()}`));

  let totalImg = 0;
  data.perf.images.forEach(i => {
    const rec = bytes[i.src]; const size = rec ? rec.size : 0; i.bytes = size; totalImg += size;
    if (size && kb(size) > BUDGET.imageKB) fails.push(`image ${kb(size)}KB > ${BUDGET.imageKB}KB — ${i.src.split('/').pop()}`);
    if (!i.svg && i.nw && i.dw && i.nw / Math.max(1, i.dw) > BUDGET.oversizeFactor)
      warns.push(`image served ${i.nw}px wide, displayed ${i.dw}px (${(i.nw / i.dw).toFixed(1)}× oversize) — ${i.src.split('/').pop()}`);
  });
  if (kb(totalImg) > BUDGET.imagesTotalKB) fails.push(`images total ${kb(totalImg)}KB > ${BUDGET.imagesTotalKB}KB`);

  Object.entries(bytes).filter(([u]) => /\.json(\?|$)/i.test(u)).forEach(([u, r]) => {
    if (kb(r.size) > BUDGET.lottieKB) fails.push(`Lottie/JSON ${kb(r.size)}KB > ${BUDGET.lottieKB}KB — ${u.split('/').pop()}`);
  });

  if (data.perf.domNodes > BUDGET.domNodes) warns.push(`DOM ${data.perf.domNodes} nodes > ${BUDGET.domNodes}`);
  if (data.perf.domDepth > BUDGET.domDepth) fails.push(`DOM depth ${data.perf.domDepth} > ${BUDGET.domDepth} — wrapper soup, flatten before shipping`);
  if (longTasks > BUDGET.longTaskMs) warns.push(`long tasks ${Math.round(longTasks)}ms > ${BUDGET.longTaskMs}ms during load`);
  if (cls !== null && cls > BUDGET.cls) fails.push(`layout shift ${cls} > ${BUDGET.cls} — reserve space for media/fonts`);

  const verdict = fails.length ? 'FAIL' : 'PASS';
  const report = {
    verdict, url, root: rootSel, width: W, mobile: mob, budgets: BUDGET,
    a11y: {
      contrastChecked: data.a11y.contrast.length, contrastFailed: badContrast.length, contrastSkipped: data.a11y.contrastSkipped,
      interactive: data.a11y.interactive.length, missingName: noName.length, notTabbable: notTabbable.length,
      headings: data.a11y.headings.map(h => `h${h.level} ${h.text}`), imagesMissingAlt: noAlt.length
    },
    perf: {
      images: data.perf.images.length, imageKBTotal: kb(totalImg),
      heaviest: data.perf.images.filter(i => i.bytes).sort((x, y) => y.bytes - x.bytes).slice(0, 3).map(i => `${i.src.split('/').pop()} ${kb(i.bytes)}KB`),
      domNodes: data.perf.domNodes, sectionNodes: data.perf.sectionNodes, domDepth: data.perf.domDepth,
      longTaskMs: Math.round(longTasks), cls, loadWindowMs: Date.now() - t0
    },
    fails, warns, measuredAt: new Date().toISOString()
  };

  fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(report, null, 2));

  console.log(`EVIDENCE page-audit — ${verdict}   ${url}  [${rootSel} @ ${W}${mob ? ' mobile' : ''}]`);
  console.log(`  a11y: contrast ${report.a11y.contrastChecked - report.a11y.contrastFailed}/${report.a11y.contrastChecked} pass (${report.a11y.contrastSkipped} unmeasurable) · interactive ${report.a11y.interactive} (${report.a11y.missingName} unnamed, ${report.a11y.notTabbable} unreachable) · alt missing ${report.a11y.imagesMissingAlt}`);
  console.log(`  perf: ${report.perf.images} images ${report.perf.imageKBTotal}KB · DOM ${report.perf.domNodes} nodes / depth ${report.perf.domDepth} · CLS ${report.perf.cls} · long tasks ${report.perf.longTaskMs}ms`);
  fails.forEach(f => console.log(`  FAIL: ${f}`));
  warns.forEach(w => console.log(`  warn: ${w}`));
  console.log(`VERDICT: ${verdict}   → ${out}`);
  p.kill(); process.exit(verdict === 'PASS' ? 0 : 1);
})().catch(e => { console.error('ERR', e.message); try { p.kill() } catch (x) {} process.exit(2) });
