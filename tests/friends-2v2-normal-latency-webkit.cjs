// Real four-WebKit gameplay on a LOOPBACK RTDB emulator, using the actual
// normal 2v2 latency-candidate HTML. Production Firebase is never touched.
'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),http=require('node:http');
const {webkit}=require('playwright-core');
if(!/^(127\.0\.0\.1|localhost):9000$/.test(process.env.FIREBASE_DATABASE_EMULATOR_HOST||''))
 throw Error('Requires 127.0.0.1 Firebase emulator');
const dir=path.resolve(__dirname,'..'),sdk=path.join(dir,'artifacts/firebase-sdk');
const fakeUrl='https://demo-brawl-draft-beta-default-rtdb.firebaseio.com/';
const htmlPath=process.env.BRAWL_STAGE_2V2==='1'?'artifacts/friends-online/normal-2vs2.html':'sites/BRAWL_FRIENDS_2vs2_LATENCY_CANDIDATE.html';
let src=fs.readFileSync(path.join(dir,htmlPath),'utf8');
const before=' db=firebase.database();';
assert.equal(src.split(before).length-1,1,'unique SDK hook: fail closed');
src=src.replace(before,before+" db.useEmulator('127.0.0.1',9000);");
src=src.replace('connect-src ','connect-src http://127.0.0.1:9000 ws://127.0.0.1:9000 ');
const probe='window.__brawlV3QA=()=>({';
assert.equal(src.split(probe).length-1,1,'unique test hook');
src=src.replace(probe,"window.__testFireNormal2v2=(angle)=>{if(!combatReady()||!Number.isFinite(angle))return false;shootAngle(angle);return true;};\n"+probe);
const server=http.createServer((req,res)=>{
 if(req.url!=='/normal'){res.writeHead(404);res.end();return;}
 res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});res.end(src);
});
async function open(browser){
 const ctx=await browser.newContext({viewport:{width:1024,height:650},isMobile:true,hasTouch:true,deviceScaleFactor:1,locale:'ja-JP'});
 const page=await ctx.newPage(),errors=[];
 page.on('pageerror',e=>errors.push('JS '+e.message));
 page.on('console',m=>{if(m.type()==='error')errors.push('CONSOLE '+m.text().slice(0,170));});
 await page.route('https://www.gstatic.com/firebasejs/10.8.0/*',async route=>{
  const name=route.request().url().split('/').pop();
  if(!['firebase-app-compat.js','firebase-database-compat.js'].includes(name))return route.abort();
  return route.fulfill({status:200,contentType:'application/javascript',body:fs.readFileSync(path.join(sdk,name))});
 });
 await page.goto('http://127.0.0.1:8879/normal',{waitUntil:'load'});
 await page.waitForFunction(()=>typeof window.__brawlV3QA==='function',null,{timeout:17000});
 await page.locator('details.online-config summary').click();
 await page.locator('#onlineDbInput').fill(fakeUrl);
 return {ctx,page,errors};
}
async function run(){
 await new Promise(resolve=>server.listen(8879,'127.0.0.1',resolve));
 let browser,all=[];
 try{
  browser=await webkit.launch({headless:true});
  all=await Promise.all(Array.from({length:4},()=>open(browser)));
  const host=all[0].page;
  await host.locator('#createBtn').click();
  await host.waitForFunction(()=>/^\d{5}$/.test(window.__brawlV3QA?.()?.roomId||''),null,{timeout:18000});
  const roomId=(await host.evaluate(()=>window.__brawlV3QA())).roomId;
  for(const c of all.slice(1)){
   await c.page.locator('#roomInput').fill(roomId);
   await c.page.locator('#joinBtn').click();
   await c.page.waitForFunction(id=>window.__brawlV3QA?.()?.roomId===id&&!!window.__brawlV3QA?.()?.seat,roomId,{timeout:16000});
  }
  const seats=await Promise.all(all.map(c=>c.page.evaluate(()=>window.__brawlV3QA())));
  assert.deepEqual(seats.map(q=>q.seat).sort(),['blue1','blue2','red1','red2']);
  const lookup=Object.fromEntries(seats.map((q,i)=>[q.seat,all[i].page]));
  // A real player chooses Bomber. This specifically targets the school issue.
  await lookup.red2.locator('#charPick button[data-char="bomber"]').click();
  await lookup.red2.waitForFunction(()=>window.__brawlV3QA?.()?.lobby?.seats?.red2?.char==='bomber',null,{timeout:12000});
  for(const c of all)await c.page.locator('#readyBtn').click();
  await Promise.all(all.map(c=>c.page.waitForFunction(()=>{
   const s=window.__brawlV3QA?.();return s?.game==='playing'&&s?.scene==='game'&&s?.online===4;
  },null,{timeout:24000})));
  await Promise.all([lookup.blue1,lookup.red2].map(page=>page.waitForFunction(
    ()=>window.__brawlV3QA?.()?.combatReadyNow,null,{timeout:18000})));
  if(process.env.BRAWL_STAGE_2V2==='1'){
   for(const page of [lookup.red1,lookup.blue2]){
    const r=await page.evaluate(()=>window.__brawlLatencyV35QA?.start(250));
    assert(r?.running&&r.localOnly,'staged browser exposes optional read-only sampler');
   }
  }
  const beforeHP=await host.evaluate(()=>window.__brawlV3QA().hp);
  assert.equal(await lookup.blue1.evaluate(()=>window.__testFireNormal2v2(0)),true);
  // An immediately committed host shot may replace the transient early
  // visual in the same frame. Capture the latched action metric; the scripted
  // 0-600ms source test separately verifies the delayed-render path.
  await lookup.red1.waitForFunction(()=>{
   const e=window.__brawlEarlyShotsQA?.();
   return e?.stats?.incoming>0;
  },null,{timeout:17000});
  assert.equal(await lookup.red2.evaluate(()=>window.__testFireNormal2v2(Math.PI)),true);
  await lookup.blue2.waitForFunction(()=>{
   const e=window.__brawlEarlyShotsQA?.();
   return e?.stats?.bomber>0;
  },null,{timeout:17000});
  const d=await Promise.all([lookup.red1,lookup.blue2].map(p=>p.evaluate(()=>window.__brawlEarlyShotsQA())));
  assert(d[0].stats.incoming>0&&d[1].stats.bomber>0);
  await host.waitForFunction(ids=>{
   const a=Object.values(window.__brawlV3QA?.()?.combat?.usedActions||{});
   return ids.every(id=>a.some(r=>r.owner===id&&r.type==='shot'&&r.status==='accepted'));
  },[seats[seats.findIndex(q=>q.seat==='blue1')].myId,
     seats[seats.findIndex(q=>q.seat==='red2')].myId],{timeout:16000});
  console.log('NORMAL 2vs2 latency QA: action preview '+JSON.stringify(d.map(x=>x.stats))+
    ' (host-fast path may bypass transient animation)');
  if(process.env.BRAWL_STAGE_2V2==='1'){
   for(const page of [lookup.red1,lookup.blue2]){
    const result=await page.evaluate(()=>{const p=window.__brawlLatencyV35QA;p.capture();return p.stop();});
    assert.equal(result.version,'V3.5');
    assert(result.projectile.receivedActionCount>=1,'real peer action counted by the local sampler');
    assert(!('pingMs' in result.traffic),'callback count must not be misreported as RTT');
    assert(!JSON.stringify(result).includes(roomId),'do not export room IDs');
   }
   console.log('PASS V3.5 NORMAL staged-only read-only sampler captured peer shot/Bomber with no identifiers');
  }
  const afterHP=await host.evaluate(()=>window.__brawlV3QA().hp);
  assert.deepEqual(afterHP,beforeHP,'remote visual-only preview never changes HP across long map');
  for(const c of all)assert.deepEqual(c.errors,[],'no Safari/WebKit page errors');
  console.log('PASS NORMAL 2vs2: four WebKit peers + real cloud-free RTDB, peer actions observed with host-accepted shots and Bomber flight logic, unchanged HP, zero page errors');
 }finally{
  await Promise.all(all.map(c=>c.ctx.close().catch(()=>{})));
  if(browser)await browser.close();
  await new Promise(resolve=>server.close(resolve));
 }
}
run().catch(e=>{console.error(e);process.exitCode=1;});
