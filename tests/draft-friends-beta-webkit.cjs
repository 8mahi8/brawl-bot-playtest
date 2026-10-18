// Browser smoke of exact Friends-BETA HTML gameplay under a LOCAL emulator.
// The local HTTP test fixture only substitutes RTDB endpoint/CSP and injects
// useEmulator(). The committed Google Sites pages never contain the hook.
'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),http=require('node:http');
const {webkit}=require('playwright-core');
if(!/^(127\\.0\\.0\\.1|localhost):9000$/.test(process.env.FIREBASE_DATABASE_EMULATOR_HOST||''))
  throw Error('LOCAL Firebase emulator is mandatory; never contact production');
const dir=path.resolve(__dirname,'..'),sdk=path.join(dir,'artifacts/firebase-sdk');
const demoUrl='https://demo-brawl-draft-beta-default-rtdb.firebaseio.com/';
const remote='https://mygame-df915-default-rtdb.firebaseio.com/';
const csp='connect-src https://*.firebaseio.com wss://*.firebaseio.com https://*.firebasedatabase.app wss://*.firebasedatabase.app https://www.googleapis.com https://*.googleapis.com';
const emulatorCsp='connect-src http://127.0.0.1:9000 ws://127.0.0.1:9000 http://localhost:9000 ws://localhost:9000';
function fixture(file){
 let s=fs.readFileSync(path.join(dir,'sites',file),'utf8');
 assert(s.includes(remote)&&s.includes(csp));
 s=s.replaceAll(remote,demoUrl).replace(csp,emulatorCsp);
 const needle=file.includes('1vs1')?'    db=firebase.database();':' db=firebase.database(); // Friends beta uses selected cloud RTDB.';
 if(!s.includes(needle))throw Error('database initialization changed: '+file);
 s=s.replace(needle,needle+' db.useEmulator(\'127.0.0.1\',9000);');
 return s;
}
const html={
 '/duel':fixture('BRAWL_DRAFT_FRIENDS_BETA_1vs1.html'),
 '/squad':fixture('BRAWL_DRAFT_FRIENDS_BETA_2vs2.html')
};
const port=8878,server=http.createServer((req,res)=>{
 if(!(req.url in html)){res.writeHead(404);res.end();return;}
 res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});res.end(html[req.url]);
});
async function open(browser,mode){
 const ctx=await browser.newContext({viewport:{width:1024,height:650},isMobile:true,hasTouch:true,locale:'ja-JP'});
 const page=await ctx.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 page.on('console',e=>{if(e.type()==='error')errors.push(e.text().slice(0,170));});
 await page.route('https://www.gstatic.com/firebasejs/10.8.0/*',async route=>{
  const name=route.request().url().split('/').pop();
  if(!['firebase-app-compat.js','firebase-database-compat.js'].includes(name))return route.abort();
  return route.fulfill({status:200,contentType:'application/javascript',body:fs.readFileSync(path.join(sdk,name))});
 });
 await page.goto('http://127.0.0.1:'+port+'/'+mode,{waitUntil:'load'});
 const qa=mode==='duel'?'__brawlV29QA':'__brawlV3QA';
 await page.waitForFunction(key=>typeof window[key]==='function',qa,{timeout:16000});
 return {ctx,page,errors,qa};
}
async function run(){
 await new Promise(resolve=>server.listen(port,'127.0.0.1',resolve));
 let browser;const all=[];
 try{
  browser=await webkit.launch({headless:true});
  const [h,g]=await Promise.all([open(browser,'duel'),open(browser,'duel')]);all.push(h,g);
  await h.page.locator('#createBtn').click();
  await h.page.waitForFunction(()=>/^\\d{5}$/.test(window.__brawlV29QA?.()?.roomId||''),null,{timeout:14000});
  const duel=(await h.page.evaluate(()=>window.__brawlV29QA())).roomId;
  await g.page.locator('#openJoinPanel').click();
  await g.page.locator('#roomInput').fill(duel);
  await g.page.locator('#joinBtn').click();
  await g.page.waitForFunction(code=>window.__brawlV29QA?.()?.roomId===code&&window.__brawlV29QA?.()?.role==='guest',duel,{timeout:14000});
  await h.page.locator('#readyBtn').click();
  await g.page.locator('#readyBtn').click();
  await Promise.all([h,g].map(x=>x.page.waitForFunction(()=>window.__brawlV29QA?.()?.game?.phase==='playing',null,{timeout:19000})));
  for(const x of [h,g]){const q=await x.page.evaluate(()=>window.__brawlV29QA());
   assert.equal(q.protocol,1031);assert.equal(q.game.round,1);assert.equal(q.game.draft.owned.host?.length||0,0);}
  const duelDb=await h.page.evaluate(async code=>(await window.firebase.database().ref('rooms/'+code+'/v').once('value')).val(),duel);
  assert.equal(duelDb,1031,'duel beta uses normal friend RTDB root with isolated draft protocol');
  console.log('PASS FRIEND BETA 1vs1: two WebKit clients joined, READY, real RTDB playing, draft protocol separate');
  await Promise.all([h,g].map(x=>x.ctx.close()));

  const clients=await Promise.all(Array.from({length:4},()=>open(browser,'squad')));all.push(...clients);
  const host=clients[0].page;
  await host.locator('#createBtn').click();
  await host.waitForFunction(()=>/^\\d{5}$/.test(window.__brawlV3QA?.()?.roomId||''),null,{timeout:17000});
  const squad=(await host.evaluate(()=>window.__brawlV3QA())).roomId;
  for(const x of clients.slice(1)){
   await x.page.locator('#roomInput').fill(squad);
   await x.page.locator('#joinBtn').click();
   await x.page.waitForFunction(code=>window.__brawlV3QA?.()?.roomId===code&&window.__brawlV3QA?.()?.seat, squad,{timeout:16000});
  }
  const first=await Promise.all(clients.map(x=>x.page.evaluate(()=>window.__brawlV3QA())));
  assert.deepEqual(first.map(q=>q.seat).sort(),['blue1','blue2','red1','red2']);
  for(const x of clients)await x.page.locator('#readyBtn').click();
  await Promise.all(clients.map(x=>x.page.waitForFunction(()=>window.__brawlV3QA?.()?.game==='playing',null,{timeout:22000})));
  const now=await Promise.all(clients.map(x=>x.page.evaluate(()=>window.__brawlV3QA())));
  assert(now.every(q=>q.protocol===13012&&q.round===1&&q.online===4));
  const squadDb=await host.evaluate(async code=>(await window.firebase.database().ref('rooms2v2/'+code+'/v').once('value')).val(),squad);
  assert.equal(squadDb,13012,'squad beta uses existing 2v2 root, no normal v3012 collision');
  for(const c of all)assert.deepEqual(c.errors,[],'unexpected WebKit JS errors');
  console.log('PASS FRIEND BETA 2vs2: four WebKit clients joined, READY, real RTDB playing, draft protocol separate');
 }finally{
  for(const c of all)try{await c.ctx.close();}catch(_){}
  if(browser)await browser.close();
  await new Promise(resolve=>server.close(resolve));
 }
}
run().catch(e=>{console.error(e);process.exitCode=1;try{server.close();}catch(_){}});
