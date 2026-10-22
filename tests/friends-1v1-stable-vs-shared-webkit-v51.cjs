'use strict';
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {webkit}=require('playwright-core');
if(!/^(127\.0\.0\.1|localhost):9000$/.test(process.env.FIREBASE_DATABASE_EMULATOR_HOST||''))throw Error('LOCAL Firebase emulator mandatory');
const root=path.resolve(__dirname,'..'),sdk=path.join(root,'artifacts/firebase-sdk');
const base=fs.readFileSync(path.join(root,'sites/BRAWL_FRIENDS_1vs1.html'),'utf8');
const candidate=fs.readFileSync(path.join(root,'artifacts/friends-online/normal-1vs1.html'),'utf8');
function block(s,a,b){const i=s.indexOf(a),j=s.indexOf(b,i+a.length);assert(i>=0&&j>i);return s.slice(i,j)}
for(const [a,b]of [
 ['  function sendPosition(){','  function moveWithWall('],
 ['  function getRemotePredicted(extra=0) {','  // A tap on the right half'],
 ['  function gameLoop(now) {','  function pointerDown(e) {']])
 assert.equal(block(base,a,b),block(candidate,a,b),'1v1 stable→shared behavioral drift: '+a);
function once(s,a,b,label){assert.equal(s.split(a).length-1,1,label);return s.replace(a,b)}
const code=[
 'const __v51={running:false,last:null,lastRemote:null,frames:[],draws:[],jumps:[],rx:0,at:0,',
 'start(){this.running=true;this.last=null;this.lastRemote=null;this.frames=[];this.draws=[];this.jumps=[];this.at=remoteSeq},',
 'mark(t,cpu){if(!this.running||!isPlaying())return;',
 'if(this.last!==null&&t>this.last&&t-this.last<2000)this.frames.push(t-this.last);',
 'if(this.lastRemote!==null)this.jumps.push(Math.hypot(remote.x-this.lastRemote.x,remote.y-this.lastRemote.y));',
 'this.last=t;this.lastRemote={x:remote.x,y:remote.y};this.draws.push(cpu);},',
 'fire(angle){if(isPlaying()&&local.ammo>0)shoot(false,angle);},',
 'stop(){this.running=false;const quant=(a,f)=>{if(!a.length)return null;const b=a.slice().sort((x,y)=>x-y);return Math.round(b[Math.max(0,Math.ceil(b.length*f)-1)]*10)/10};',
 'return {role,frames:this.frames.length,receivedPositions:remoteSeq-this.at,connected,playing:isPlaying(),',
 'frameP95Ms:quant(this.frames,.95),drawP95Ms:quant(this.draws,.95),',
 'remoteJumpP95:quant(this.jumps,.95),remoteMaxJump:quant(this.jumps,1),',
 'remoteJumpsAbove45:this.jumps.filter(x=>x>45).length,frameGapsOver100Ms:this.frames.filter(x=>x>100).length};}};',
 'window.__v51DuelQA=__v51;'
].join('\n');
function fixture(html){
 const original='https://mygame-df915-default-rtdb.firebaseio.com/';
 assert(html.includes(original));
 let s=html.replaceAll(original,'https://demo-brawl-draft-beta-default-rtdb.firebaseio.com/');
 s=once(s,'db=firebase.database();',"db=firebase.database();db.useEmulator('127.0.0.1',9000);",'SDK');
 s=once(s,'connect-src ','connect-src http://127.0.0.1:9000 ws://127.0.0.1:9000 ','CSP');
 s=once(s,'  window.__brawlV29QA=()=>({',code+'\n  window.__brawlV29QA=()=>({','QA');
 s=once(s,'    draw();requestAnimationFrame(gameLoop);',
 '    const at=performance.now();draw();window.__v51DuelQA.mark(now,performance.now()-at);requestAnimationFrame(gameLoop);','frame');
 return s;
}
const pages={'/frozen':fixture(base),'/generated':fixture(candidate)};
const server=http.createServer((req,res)=>{if(!(req.url in pages)){res.writeHead(404);return res.end()}res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});res.end(pages[req.url])});
async function open(browser,variant){
 const ctx=await browser.newContext({viewport:{width:1024,height:650},isMobile:true,hasTouch:true,deviceScaleFactor:2,locale:'ja-JP'});
 const page=await ctx.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('https://www.gstatic.com/firebasejs/10.8.0/*',route=>{const name=route.request().url().split('/').pop();if(!['firebase-app-compat.js','firebase-database-compat.js'].includes(name))return route.abort();return route.fulfill({status:200,contentType:'application/javascript',body:fs.readFileSync(path.join(sdk,name))});});
 await page.goto('http://127.0.0.1:8891'+variant,{waitUntil:'load'});
 await page.waitForFunction(()=>!!window.__v51DuelQA&&!!window.__brawlV29QA,null,{timeout:17000});
 return {ctx,page,errors};
}
async function trial(browser,variant){
 const peers=await Promise.all([open(browser,variant),open(browser,variant)]);
 try{
  const [a,b]=peers.map(x=>x.page);
  await a.locator('#createBtn').click();
  await a.waitForFunction(()=>/^\d{5}$/.test(window.__brawlV29QA?.()?.roomId||''),null,{timeout:20000});
  const id=(await a.evaluate(()=>window.__brawlV29QA())).roomId;
  await b.locator('#openJoinPanel').click();await b.locator('#roomInput').fill(id);await b.locator('#joinBtn').click();
  await b.waitForFunction(id=>window.__brawlV29QA?.()?.role==='guest'&&window.__brawlV29QA?.()?.roomId===id,id,{timeout:17000});
  await a.locator('#readyBtn').click();await b.locator('#readyBtn').click();
  await Promise.all([a,b].map(p=>p.waitForFunction(()=>window.__brawlV29QA?.()?.game?.phase==='playing',null,{timeout:24000})));
  await Promise.all([a,b].map(p=>p.evaluate(()=>window.__v51DuelQA.start())));
  for(let turn=0;turn<5;turn++){
   const right=turn%2===0;
   await Promise.all([a.keyboard.down(right?'ArrowRight':'ArrowLeft'),b.keyboard.down(right?'ArrowLeft':'ArrowRight')]);
   await Promise.all([a,b].map((p,i)=>p.evaluate(i=>window.__v51DuelQA.fire(i?Math.PI:0),i)));
   await a.waitForTimeout(1550);
   await Promise.all([a.keyboard.up(right?'ArrowRight':'ArrowLeft'),b.keyboard.up(right?'ArrowLeft':'ArrowRight')]);
  }
  const stats=await Promise.all([a,b].map(p=>p.evaluate(()=>window.__v51DuelQA.stop())));
  for(let i=0;i<2;i++){
   assert(stats[i].frames>=20,'live duel must render real frames '+variant+'/'+i);
   assert(stats[i].receivedPositions>=6,'real remote Firebase positions must arrive '+variant+'/'+i);
   assert(stats[i].connected,'duel network connected '+variant+'/'+i);
   assert.deepEqual(peers[i].errors,[],'duel JS errors '+variant+'/'+i);
  }
  return stats;
 }finally{await Promise.all(peers.map(p=>p.ctx.close()))}
}
(async()=>{
 await new Promise(resolve=>server.listen(8891,'127.0.0.1',resolve));let browser;
 try{
  browser=await webkit.launch({headless:true});
  const result={version:'V5.1',test:'actual 2-player movement/fire (WebKit local Firebase)',frozen:await trial(browser,'/frozen'),generated:await trial(browser,'/generated'),note:'shared CI is not school iPad/Google Sites; only test copies instrumented'};
  const out=path.join(root,'artifacts/qa/v51-1vs1-frozen-vs-shared.json');
  fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(result,null,2)+'\n');
  console.log('PASS V5.1 original vs generated 1v1 genuine movement/render '+JSON.stringify(result));
 }finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve))}
})().catch(e=>{console.error(e);process.exitCode=1});
