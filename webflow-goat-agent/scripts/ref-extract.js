// Live-site computed-style extractor for Webflow design-intake (URL reference path).
// Dumps EXACT computed CSS per element — ground truth like Figma get_design_context, zero guessing.
// Usage: node ref-extract.js <url> <out.json> <W> <cssSelector|-> <mobile:1|0> <port>
//   e.g. node ref-extract.js "https://site.com/" ref-cache/site.com/home-1440.json 1440 - 0 9251
//        section only: node ref-extract.js "https://site.com/" hero.json 1440 ".hero" 0 9252
// Needs ws (npm i ws --no-save at home dir) + Google Chrome.
const CDP=require('child_process');const http=require('http');const fs=require('fs');const os=require('os');const path=require('path');
let WebSocket;try{WebSocket=require('ws')}catch(e){WebSocket=require(path.join(os.homedir(),'node_modules','ws'))}
const CHROME=process.platform==='darwin'?'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  :process.platform==='win32'?'C:/Program Files/Google/Chrome/Application/chrome.exe':'google-chrome';
const PROF=path.join(os.tmpdir(),'wf-cdp-prof');
const url=process.argv[2],out=process.argv[3],W=+process.argv[4]||1440,sel=(process.argv[5]&&process.argv[5]!=='-')?process.argv[5]:'body',mob=process.argv[6]==='1',port=+process.argv[7]||9251;
if(!url||!out){console.error('usage: node ref-extract.js <url> <out.json> <W> <selector|-> <mobile:1|0> <port>');process.exit(2)}
const p=CDP.spawn(CHROME,["--headless=new","--disable-gpu","--remote-debugging-port="+port,"--remote-allow-origins=*","--no-first-run","--user-data-dir="+PROF+port,"about:blank"]);
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const get=p2=>new Promise((res,rej)=>{http.get({host:'127.0.0.1',port,path:p2},r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>res(JSON.parse(d)))}).on('error',rej)});
const WALKER=`(function(){
 var ROOT=document.querySelector(${JSON.stringify(sel)});if(!ROOT)return JSON.stringify({error:'selector not found: '+${JSON.stringify(sel)}});
 var SKIP={SCRIPT:1,STYLE:1,NOSCRIPT:1,META:1,LINK:1,TEMPLATE:1,IFRAME:1};
 var DEF={display:'',position:'static','flex-direction':'row','flex-wrap':'nowrap','justify-content':'normal','align-items':'normal',
  'row-gap':'normal','column-gap':'normal','grid-template-columns':'none','max-width':'none','min-width':'0px','min-height':'0px',
  'font-style':'normal','text-align':'start','text-transform':'none','text-decoration-line':'none','letter-spacing':'normal',
  'background-color':'rgba(0, 0, 0, 0)','background-image':'none','box-shadow':'none',opacity:'1',overflow:'visible',
  'object-fit':'fill','z-index':'auto',transform:'none',filter:'none','backdrop-filter':'none','mix-blend-mode':'normal',cursor:'auto',
  transition:'all 0s ease 0s','background-size':'auto','background-position':'0% 0%'};
 var TRANS_DEF={'all':1,'all 0s ease 0s':1,'':1};
 var PROPS=['display','position','flex-direction','flex-wrap','justify-content','align-items','row-gap','column-gap',
  'grid-template-columns','width','max-width','min-width','height','min-height',
  'padding-top','padding-right','padding-bottom','padding-left','margin-top','margin-right','margin-bottom','margin-left',
  'font-family','font-size','font-weight','font-style','line-height','letter-spacing','text-align','text-transform','text-decoration-line',
  'color','background-color','background-image','background-size','background-position',
  'border-top-width','border-right-width','border-bottom-width','border-left-width',
  'border-top-style','border-right-style','border-bottom-style','border-left-style',
  'border-top-color','border-right-color','border-bottom-color','border-left-color',
  'border-top-left-radius','border-top-right-radius','border-bottom-right-radius','border-bottom-left-radius',
  'box-shadow','opacity','overflow','object-fit','z-index','transform','filter','backdrop-filter','mix-blend-mode','cursor','transition'];
 var ZERO={'row-gap':1,'column-gap':1,'padding-top':1,'padding-right':1,'padding-bottom':1,'padding-left':1,
  'margin-top':1,'margin-right':1,'margin-bottom':1,'margin-left':1,'border-top-width':1,'border-right-width':1,'border-bottom-width':1,'border-left-width':1,
  'border-top-left-radius':1,'border-top-right-radius':1,'border-bottom-right-radius':1,'border-bottom-left-radius':1};
 var nodes=[],count=0,MAX=800;
 function ownText(el){var t='';for(var i=0;i<el.childNodes.length;i++){var n=el.childNodes[i];if(n.nodeType===3)t+=n.textContent;}return t.replace(/\\s+/g,' ').trim().slice(0,300);}
 function walk(el,depth,pathStr){
  if(count>=MAX||depth>14)return;
  if(SKIP[el.tagName])return;
  var cs=getComputedStyle(el);
  if(cs.display==='none')return;
  var r=el.getBoundingClientRect();
  if(r.width===0&&r.height===0)return;
  var st={};
  for(var i=0;i<PROPS.length;i++){var k=PROPS[i],v=cs.getPropertyValue(k);
   if(v===''||v===DEF[k])continue;
   if(ZERO[k]&&v==='0px')continue;
   if(k==='transition'&&TRANS_DEF[v])continue;
   st[k]=v;}
  if(!st['border-top-width']&&!st['border-right-width']&&!st['border-bottom-width']&&!st['border-left-width']){
    ['top','right','bottom','left'].forEach(function(s){delete st['border-'+s+'-style'];delete st['border-'+s+'-color'];});}
  var o={tag:el.tagName.toLowerCase(),depth:depth,path:pathStr};
  if(el.id)o.id=el.id;
  if(el.className&&typeof el.className==='string'&&el.className.trim())o.class=el.className.trim();
  var txt=ownText(el);if(txt)o.text=txt;
  if(el.tagName==='IMG'){o.src=el.currentSrc||el.src;if(el.alt)o.alt=el.alt;o.natural=el.naturalWidth+'x'+el.naturalHeight;}
  if(el.tagName==='A'&&el.getAttribute('href'))o.href=el.getAttribute('href');
  if(el.tagName==='svg'||el.tagName==='SVG'){o.svg=true;o.svgSize=Math.round(r.width)+'x'+Math.round(r.height);}
  o.box={x:Math.round(r.left+window.scrollX),y:Math.round(r.top+window.scrollY),w:Math.round(r.width),h:Math.round(r.height)};
  o.styles=st;
  nodes.push(o);count++;
  if(el.tagName==='svg'||el.tagName==='SVG')return; // don't walk svg internals
  var kids=el.children,ci=0;
  for(var j=0;j<kids.length;j++){ci++;walk(kids[j],depth+1,pathStr+'>'+kids[j].tagName.toLowerCase()+(ci>1?'['+ci+']':''));}
 }
 walk(ROOT,0,ROOT.tagName.toLowerCase());
 var rootVars={};
 try{for(var s=0;s<document.styleSheets.length;s++){var rules;try{rules=document.styleSheets[s].cssRules}catch(e){continue}
  if(!rules)continue;
  for(var q=0;q<rules.length;q++){var rl=rules[q];
   if(rl.selectorText&&(rl.selectorText===':root'||rl.selectorText==='html')&&rl.style){
    for(var v2=0;v2<rl.style.length;v2++){var pn=rl.style[v2];if(pn.indexOf('--')===0)rootVars[pn]=rl.style.getPropertyValue(pn).trim();}}}}}catch(e){}
 var fonts={};nodes.forEach(function(n){if(n.styles['font-family'])fonts[n.styles['font-family']]=1;});
 return JSON.stringify({url:location.href,title:document.title,viewport:{w:window.innerWidth},selector:${JSON.stringify(sel)},
  nodeCount:nodes.length,truncated:count>=MAX,fonts:Object.keys(fonts),rootVars:rootVars,nodes:nodes});
})()`;
(async()=>{
 let list;for(let i=0;i<50;i++){try{list=await get('/json/list');if(list&&list.length)break}catch(e){}await wait(200)}
 const t=list.find(x=>x.type==='page');const sock=new WebSocket(t.webSocketDebuggerUrl,{headers:{Origin:'http://localhost'}});
 let id=0;const pend={};sock.on('message',m=>{const o=JSON.parse(m);if(o.id&&pend[o.id])pend[o.id](o.result)});
 await new Promise((r,j)=>{sock.on('open',r);sock.on('error',j)});
 const cmd=(method,params)=>new Promise(r=>{const i=++id;pend[i]=r;sock.send(JSON.stringify({id:i,method,params:params||{}}))});
 await cmd('Page.enable');await cmd('Runtime.enable');
 await cmd('Emulation.setDeviceMetricsOverride',{width:W,height:1000,deviceScaleFactor:1,mobile:mob});
 await cmd('Page.navigate',{url});await wait(5000);
 await cmd('Runtime.evaluate',{expression:"window.scrollTo(0,document.body.scrollHeight);"});await wait(1500); // trigger lazy-load
 await cmd('Runtime.evaluate',{expression:"window.scrollTo(0,0);document.querySelectorAll('*').forEach(function(e){var s=getComputedStyle(e); if(+s.opacity===0) e.style.opacity=1;});"});
 await wait(800);
 const r=await cmd('Runtime.evaluate',{expression:WALKER,returnByValue:true});
 if(!r||!r.result||typeof r.result.value!=='string')throw new Error('extract failed: '+JSON.stringify(r&&r.exceptionDetails||r));
 fs.mkdirSync(path.dirname(path.resolve(out)),{recursive:true});
 fs.writeFileSync(out,r.result.value);
 const parsed=JSON.parse(r.result.value);
 console.log(parsed.error?('ERR '+parsed.error):('OK '+parsed.nodeCount+' nodes'+(parsed.truncated?' (TRUNCATED at cap — extract per-section instead)':'')+' → '+out));
 p.kill();process.exit(parsed.error?1:0);
})().catch(e=>{console.error('ERR',e.message);p.kill();process.exit(1)});
