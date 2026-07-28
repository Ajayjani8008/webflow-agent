const CDP=require('child_process');const http=require('http');const fs=require('fs');const os=require('os');const path=require('path');let WebSocket;try{WebSocket=require('ws')}catch(e){WebSocket=require(path.join(os.homedir(),'node_modules','ws'))}
const CHROME=process.platform==="darwin"?"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome":process.platform==="win32"?"C:/Program Files/Google/Chrome/Application/chrome.exe":"google-chrome";
const PROF=path.join(os.tmpdir(),"wf-cdp-prof");
const url=process.argv[2],out=process.argv[3],W=+process.argv[4],H=+process.argv[5],mobile=process.argv[6]==='1',port=+process.argv[7];
const p=CDP.spawn(CHROME,["--headless=new","--disable-gpu","--remote-debugging-port="+port,"--remote-allow-origins=*","--no-first-run","--user-data-dir="+PROF+port,"about:blank"]);
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const get=path=>new Promise((res,rej)=>{http.get({host:'127.0.0.1',port,path},r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>res(JSON.parse(d)))}).on('error',rej)});
(async()=>{
 let list;for(let i=0;i<50;i++){try{list=await get('/json/list');if(list&&list.length)break}catch(e){}await wait(200)}
 const t=list.find(x=>x.type==='page');const sock=new WebSocket(t.webSocketDebuggerUrl,{headers:{Origin:'http://localhost'}});
 let id=0;const pend={};sock.on('message',m=>{const o=JSON.parse(m);if(o.id&&pend[o.id])pend[o.id](o.result)});
 await new Promise((r,j)=>{sock.on('open',r);sock.on('error',j)});
 const cmd=(method,params)=>new Promise(r=>{const i=++id;pend[i]=r;sock.send(JSON.stringify({id:i,method,params:params||{}}))});
 await cmd('Page.enable');
 await cmd('Emulation.setDeviceMetricsOverride',{width:W,height:H,deviceScaleFactor:2,mobile});
 await cmd('Page.navigate',{url});await wait(4000);
 const r=await cmd('Page.captureScreenshot',{format:'png',clip:{x:0,y:0,width:W,height:H,scale:1}});
 fs.writeFileSync(out,Buffer.from(r.data,'base64'));p.kill();process.exit(0);
})().catch(e=>{console.error('ERR',e.message);p.kill();process.exit(1)});
