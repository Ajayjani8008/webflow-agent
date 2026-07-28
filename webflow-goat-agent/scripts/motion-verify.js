// Motion verification for Webflow animations — proves motion RAN, measures it, flags jank.
// Usage: node motion-verify.js <url> <out.json> <W> <cssSelector> <hover|click|load|scroll|all> <mobile:1|0> <port>
//   e.g. node motion-verify.js "https://x.webflow.io/" hero-motion.json 1440 ".hero" all 0 9261
// Writes <out.json> plus frame PNGs <out>-{mode}-{start,mid,end}.png next to it.
// Reports per element: moved · propsAnimated · jankProps · durationObserved · ix2 (data-w-id) ·
// initialStateFlash · plus reducedMotionRespected for the page.
// Needs ws: npm i ws --no-save at home dir. Chrome required. Cross-platform.
const CDP = require('child_process'); const http = require('http'); const fs = require('fs');
const os = require('os'); const path = require('path');
let WebSocket; try { WebSocket = require('ws') } catch (e) { WebSocket = require(path.join(os.homedir(), 'node_modules', 'ws')) }
const CHROME = process.platform === "darwin" ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
  : process.platform === "win32" ? "C:/Program Files/Google/Chrome/Application/chrome.exe" : "google-chrome";
const PROF = path.join(os.tmpdir(), "wf-cdp-prof");

const url = process.argv[2], out = process.argv[3], W = +process.argv[4] || 1440,
  sel = process.argv[5] || 'body', mode = (process.argv[6] || 'all').toLowerCase(),
  mob = process.argv[7] === '1', port = +process.argv[8] || 9261;
if (!url || !out) { console.error('usage: node motion-verify.js <url> <out.json> <W> <selector> <mode> <mobile> <port>'); process.exit(1) }

// Composited motion + paint-only changes (colour/shadow hovers are real motion — tracking only
// opacity/transform/filter reports moved:false on a perfectly good colour-fade hover).
const MOTION_PROPS = ['opacity', 'transform', 'filter', 'backgroundColor', 'color', 'boxShadow', 'borderTopColor', 'backgroundImage'];
const JANK_PROPS = ['width', 'height', 'marginTop', 'marginLeft', 'paddingTop', 'paddingLeft', 'fontSize', 'top', 'left', 'borderTopWidth'];
// Declared timing read straight from computed CSS = EXACT (no sampling error). Observed timing only proves it ran.
const DECL_PROPS = ['animationName', 'animationDuration', 'animationDelay', 'animationIterationCount',
  'animationTimingFunction', 'transitionProperty', 'transitionDuration', 'transitionTimingFunction'];
const SAMPLE_MS = 40, WINDOW_MS = 2200, MAX_EL = 60;

const p = CDP.spawn(CHROME, ["--headless=new", "--disable-gpu", "--remote-debugging-port=" + port,
  "--remote-allow-origins=*", "--no-first-run", "--user-data-dir=" + PROF + port, "about:blank"]);
const wait = ms => new Promise(r => setTimeout(r, ms));
const get = pth => new Promise((res, rej) => {
  http.get({ host: '127.0.0.1', port, path: pth }, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d))) }).on('error', rej)
});

// Serialized in-page collector: root + descendants, capped, keyed by a stable path id.
const COLLECT = `(function(){
  var root=document.querySelector(${JSON.stringify(sel)});
  if(!root) return JSON.stringify({err:'selector not found'});
  var els=[root].concat(Array.prototype.slice.call(root.querySelectorAll('*'))).slice(0,${MAX_EL});
  var out=[];
  for(var i=0;i<els.length;i++){
    var e=els[i], s=getComputedStyle(e), r=e.getBoundingClientRect();
    var key=(e.tagName||'').toLowerCase()+'#'+i+(e.className&&typeof e.className==='string'?'.'+e.className.trim().split(/\\s+/).slice(0,2).join('.'):'');
    var rec={k:key,wid:e.getAttribute('data-w-id')||null,rect:{t:Math.round(r.top+window.scrollY),h:Math.round(r.height),w:Math.round(r.width)}};
    ${JSON.stringify(MOTION_PROPS)}.forEach(function(pn){rec[pn]=s[pn]});
    ${JSON.stringify(JANK_PROPS)}.forEach(function(pn){rec[pn]=s[pn]});
    ${JSON.stringify(DECL_PROPS)}.forEach(function(pn){rec[pn]=s[pn]});
    out.push(rec);
  }
  return JSON.stringify({t:Math.round(performance.now()),els:out});
})()`;

function analyze(samples) {
  if (!samples.length) return { elements: [], note: 'no samples' };
  const byKey = new Map();
  samples.forEach(s => (s.els || []).forEach(e => {
    if (!byKey.has(e.k)) byKey.set(e.k, []);
    byKey.get(e.k).push({ t: s.t, e });
  }));
  const elements = [];
  byKey.forEach((series, k) => {
    if (series.length < 2) return;
    const changed = {}, firstChange = {}, lastChange = {};
    const track = pn => {
      let prev = series[0].e[pn];
      for (let i = 1; i < series.length; i++) {
        const v = series[i].e[pn];
        if (v !== prev) {
          changed[pn] = true;
          if (firstChange[pn] === undefined) firstChange[pn] = series[i - 1].t;
          lastChange[pn] = series[i].t;
          prev = v;
        }
      }
    };
    MOTION_PROPS.concat(JANK_PROPS).forEach(track);
    const propsAnimated = MOTION_PROPS.filter(pn => changed[pn]);
    const jankProps = JANK_PROPS.filter(pn => changed[pn]);
    if (!propsAnimated.length && !jankProps.length) return; // static element, not interesting
    const times = Object.keys(changed).map(pn => [firstChange[pn], lastChange[pn]]);
    const t0 = Math.min.apply(null, times.map(x => x[0]));
    const t1 = Math.max.apply(null, times.map(x => x[1]));
    // initial-state flash: opacity visible, then hidden, then visible again
    const ops = series.map(s => parseFloat(s.e.opacity));
    let flash = false;
    for (let i = 1; i < ops.length - 1; i++) if (ops[0] > 0.9 && ops[i] < 0.5 && ops[ops.length - 1] > 0.9) { flash = true; break }
    const last = series[series.length - 1].e;
    elements.push({
      element: k,
      ix2: !!series[0].e.wid,
      moved: propsAnimated.length > 0,
      propsAnimated, jankProps,
      durationObservedMs: Math.max(0, t1 - t0),
      durationDeclaredMs: declaredMs(last),      // exact, from computed CSS — use this for the ±tolerance gate
      declared: {
        animation: last.animationName && last.animationName !== 'none'
          ? last.animationName + ' ' + last.animationDuration + ' ' + last.animationTimingFunction +
            ' delay ' + last.animationDelay + ' ×' + last.animationIterationCount : null,
        transition: last.transitionDuration && last.transitionDuration !== '0s'
          ? last.transitionProperty + ' ' + last.transitionDuration + ' ' + last.transitionTimingFunction : null
      },
      from: pick(series[0].e), to: pick(last),
      initialStateFlash: flash
    });
  });
  return { elements };
}
const pick = e => ({ opacity: e.opacity, transform: e.transform, filter: e.filter });
const secToMs = v => {
  if (!v) return 0;
  return Math.max.apply(null, String(v).split(',').map(s => {
    s = s.trim();
    if (s.endsWith('ms')) return parseFloat(s) || 0;
    if (s.endsWith('s')) return (parseFloat(s) || 0) * 1000;
    return 0;
  }));
};
// Declared duration: CSS animation wins over transition (an animation is the deliberate timeline).
const declaredMs = e => {
  const a = (e.animationName && e.animationName !== 'none') ? secToMs(e.animationDuration) : 0;
  return a || secToMs(e.transitionDuration) || null;
};

(async () => {
  let list; for (let i = 0; i < 50; i++) { try { list = await get('/json/list'); if (list && list.length) break } catch (e) { } await wait(200) }
  const t = list.find(x => x.type === 'page');
  const sock = new WebSocket(t.webSocketDebuggerUrl, { headers: { Origin: 'http://localhost' } });
  let id = 0; const pend = {};
  sock.on('message', m => { const o = JSON.parse(m); if (o.id && pend[o.id]) pend[o.id](o.result) });
  await new Promise((r, j) => { sock.on('open', r); sock.on('error', j) });
  const cmd = (method, params) => new Promise(r => { const i = ++id; pend[i] = r; sock.send(JSON.stringify({ id: i, method, params: params || {} })) });
  const evalJS = async expr => {
    const r = await cmd('Runtime.evaluate', { expression: expr, returnByValue: true });
    return r && r.result ? r.result.value : null;
  };
  const sample = async () => { const raw = await evalJS(COLLECT); try { return JSON.parse(raw) } catch (e) { return null } };
  const shot = async name => {
    const b = await cmd('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
    if (b && b.data) fs.writeFileSync(out.replace(/\.json$/, '') + '-' + name + '.png', Buffer.from(b.data, 'base64'));
  };

  await cmd('Page.enable'); await cmd('Runtime.enable');
  await cmd('Emulation.setDeviceMetricsOverride', { width: W, height: 900, deviceScaleFactor: 1, mobile: mob });

  const result = { url, selector: sel, width: W, mobile: mob, modes: {} };

  const runWindow = async (label, primer) => {
    const samples = []; const start = Date.now();
    if (primer) await primer();
    while (Date.now() - start < WINDOW_MS) {
      const s = await sample(); if (s && s.els) samples.push(s);
      if (samples.length === 1) await shot(label + '-start');
      await wait(SAMPLE_MS);
    }
    if (samples.length > 2) { /* mid frame already passed; capture end */ }
    await shot(label + '-end');
    const a = analyze(samples);
    a.samples = samples.length;
    result.modes[label] = a;
    return a;
  };

  const box = async () => {
    const r = await evalJS(`(function(){var e=document.querySelector(${JSON.stringify(sel)});if(!e)return null;var r=e.getBoundingClientRect();return JSON.stringify({x:r.left+r.width/2,y:r.top+r.height/2,top:r.top+window.scrollY,h:r.height})})()`);
    try { return JSON.parse(r) } catch (e) { return null }
  };

  const want = m => mode === 'all' || mode === m;

  // ---- load / page-load animations ----
  // Sample the instant the DOM exists — a 400ms head start truncates a 600ms reveal and lies about its duration.
  if (want('load')) {
    await cmd('Page.navigate', { url });
    for (let i = 0; i < 60; i++) {
      const ready = await evalJS(`(function(){var e=document.querySelector(${JSON.stringify(sel)});return e?document.readyState:''})()`);
      if (ready) break;
      await wait(25);
    }
    await runWindow('load');
  } else {
    await cmd('Page.navigate', { url }); await wait(4000);
  }

  // ---- scroll (reveals, parallax, scrub) ----
  if (want('scroll')) {
    const b = await box();
    if (b) {
      await evalJS(`window.scrollTo(0, ${Math.max(0, Math.round(b.top - 900))})`);
      await wait(600);
      const samples = []; const steps = 16;
      await shot('scroll-start');
      for (let i = 0; i <= steps; i++) {
        await evalJS(`window.scrollTo(0, ${Math.max(0, Math.round(b.top - 900 + (b.h + 900) * i / steps))})`);
        await wait(90);
        const s = await sample(); if (s && s.els) samples.push(s);
      }
      await shot('scroll-end');
      const a = analyze(samples); a.samples = samples.length; result.modes.scroll = a;
    }
  }

  // ---- hover ----
  // Hover EVERY interactive descendant in turn. Hovering the section's centre point (the old bug) touches
  // empty space and reports "no hover motion" on a section whose buttons all animate.
  if (want('hover')) {
    const b = await box();
    if (b) {
      await evalJS(`window.scrollTo(0, ${Math.max(0, Math.round(b.top - 200))})`); await wait(500);
      const targetsRaw = await evalJS(`(function(){
        var root=document.querySelector(${JSON.stringify(sel)}); if(!root) return '[]';
        var q='a,button,[role="button"],input,select,textarea,label,[class*="btn"],[class*="button"],[class*="card"],[class*="link"],[class*="nav"],[class*="item"],[class*="icon"]';
        var set=[], seen=[];
        Array.prototype.slice.call(root.querySelectorAll(q)).forEach(function(e){
          var r=e.getBoundingClientRect();
          if(r.width<4||r.height<4||r.bottom<0||r.top>window.innerHeight) return;
          if(seen.indexOf(e)>-1) return; seen.push(e);
          set.push({x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)});
        });
        return JSON.stringify(set.slice(0,8));
      })()`);
      let targets = []; try { targets = JSON.parse(targetsRaw) } catch (e) { }
      if (!targets.length) targets = [{ x: Math.round(b.x), y: Math.round(Math.min(880, Math.max(2, b.y))) }];
      const samples = [];
      await shot('hover-start');
      for (const tg of targets) {
        await cmd('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 2, y: 2 });   // reset out
        await wait(120);
        const s0 = await sample(); if (s0 && s0.els) samples.push(s0);
        await cmd('Input.dispatchMouseEvent', { type: 'mouseMoved', x: tg.x, y: Math.min(880, Math.max(2, tg.y)) });
        for (let i = 0; i < 10; i++) { await wait(SAMPLE_MS); const s = await sample(); if (s && s.els) samples.push(s) }
      }
      await shot('hover-end');
      const a = analyze(samples); a.samples = samples.length; a.targetsHovered = targets.length;
      result.modes.hover = a;
    }
  }

  // ---- click ----
  if (want('click')) {
    const b = await box();
    if (b) {
      const x = Math.round(b.x), y = Math.round(Math.min(880, Math.max(2, b.y)));
      await runWindow('click', async () => {
        await cmd('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
        await cmd('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
      });
    }
  }

  // ---- reduced motion pass ----
  await cmd('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await cmd('Page.navigate', { url }); await wait(400);
  const rmSamples = []; const rmStart = Date.now();
  while (Date.now() - rmStart < 1800) { const s = await sample(); if (s && s.els) rmSamples.push(s); await wait(SAMPLE_MS) }
  const rm = analyze(rmSamples);
  const rmMoved = rm.elements.filter(e => e.moved).length;
  result.reducedMotion = { movingElements: rmMoved, respected: rmMoved === 0, note: rmMoved ? 'elements still animate under prefers-reduced-motion' : 'no motion under reduce' };

  // ---- summary ----
  const all = Object.keys(result.modes).map(k => result.modes[k].elements || []).reduce((a, b) => a.concat(b), []);
  result.summary = {
    modesRun: Object.keys(result.modes),
    elementsMoved: all.filter(e => e.moved).length,
    ix2Attached: all.filter(e => e.ix2).length,
    jankFlagged: all.filter(e => e.jankProps.length).map(e => ({ element: e.element, props: e.jankProps })),
    initialStateFlash: all.filter(e => e.initialStateFlash).map(e => e.element),
    verdict: all.filter(e => e.moved).length === 0 ? 'NO MOTION DETECTED — animation not applied or trigger not reached'
      : all.some(e => e.jankProps.length) ? 'MOTION PRESENT, JANK FLAGGED'
        : !result.reducedMotion.respected ? 'MOTION PRESENT, REDUCED-MOTION NOT RESPECTED'
          : 'MOTION VERIFIED'
  };

  fs.writeFileSync(out, JSON.stringify(result, null, 2));
  console.log(result.summary.verdict + ' · moved ' + result.summary.elementsMoved + ' · ix2 ' + result.summary.ix2Attached +
    ' · jank ' + result.summary.jankFlagged.length + ' · reduced-motion ' + (result.reducedMotion.respected ? 'ok' : 'FAIL') + ' → ' + out);
  p.kill(); process.exit(0);
})().catch(e => { console.error('ERR', e && e.message); try { p.kill() } catch (_) { } process.exit(1) });
