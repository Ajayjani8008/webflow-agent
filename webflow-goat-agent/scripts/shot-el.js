// Element-clip published-page screenshot for Webflow pixel-verify.
// Usage: node shot-el.js <url> <out.png> <W> <cssSelector> <mobile:1|0> <port>
//   e.g. node shot-el.js "https://x.webflow.io/" hero.png 1440 ".example-hero" 0 9247
//        mobile: node shot-el.js "https://x.webflow.io/" hero-m.png 390 ".example-hero" 1 9248
// Clips to the element's bounding box (CDP clip is PAGE-origin, not viewport) and
// defeats Webflow load-animation opacity:0. Needs ws: npm i ws --no-save at home dir. Cross-platform (Win/Mac/Linux).
const CDP=require('child_process');const http=require('http');const fs=require('fs');const os=require('os');const path=require('path');let WebSocket;try{WebSocket=require('ws')}catch(e){WebSocket=require(path.join(os.homedir(),'node_modules','ws'))}
const CHROME=process.platform==="darwin"?"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome":process.platform==="win32"?"C:/Program Files/Google/Chrome/Application/chrome.exe":"google-chrome";
const PROF=path.join(os.tmpdir(),"wf-cdp-prof");
const url=process.argv[2],out=process.argv[3],W=+process.argv[4],sel=process.argv[5]||'body',mob=process.argv[6]==='1',port=+process.argv[7];
if(!url||!out||!W){console.error('usage: node shot-el.js <url> <out.png> <W> <cssSelector> <mobile:1|0> <port>');process.exit(2)}
const p=CDP.spawn(CHROME,["--headless=new","--disable-gpu","--remote-debugging-port="+port,"--remote-allow-origins=*","--no-first-run","--user-data-dir="+PROF+port,"about:blank"]);
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const get=path=>new Promise((res,rej)=>{http.get({host:'127.0.0.1',port,path},r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>res(JSON.parse(d)))}).on('error',rej)});
(async()=>{
 let list;for(let i=0;i<50;i++){try{list=await get('/json/list');if(list&&list.length)break}catch(e){}await wait(200)}
 const t=list.find(x=>x.type==='page');const sock=new WebSocket(t.webSocketDebuggerUrl,{headers:{Origin:'http://localhost'}});
 let id=0;const pend={};sock.on('message',m=>{const o=JSON.parse(m);if(o.id&&pend[o.id])pend[o.id](o.result)});
 await new Promise((r,j)=>{sock.on('open',r);sock.on('error',j)});
 const cmd=(method,params)=>new Promise(r=>{const i=++id;pend[i]=r;sock.send(JSON.stringify({id:i,method,params:params||{}}))});
 await cmd('Page.enable');await cmd('Runtime.enable');
 await cmd('Emulation.setDeviceMetricsOverride',{width:W,height:1000,deviceScaleFactor:2,mobile:mob});
 await cmd('Page.navigate',{url});await wait(5000);
 // defeat any load-animation that leaves content at opacity:0
 await cmd('Runtime.evaluate',{expression:"document.querySelectorAll('*').forEach(function(e){var s=getComputedStyle(e); if(+s.opacity===0) e.style.opacity=1;});"});
 await wait(500);
 const r=await cmd('Runtime.evaluate',{expression:"var h=document.querySelector("+JSON.stringify(sel)+");var r=h.getBoundingClientRect();JSON.stringify({top:r.top+window.scrollY,h:r.height})",returnByValue:true});
 const box=JSON.parse(r.result.value);
 const shot=await cmd('Page.captureScreenshot',{format:'png',captureBeyondViewport:true,clip:{x:0,y:box.top,width:W,height:Math.min(box.h,1200),scale:1}});
 fs.writeFileSync(out,Buffer.from(shot.data,'base64'));p.kill();process.exit(0);
})().catch(e=>{console.error('ERR',e.message);p.kill();process.exit(1)});
