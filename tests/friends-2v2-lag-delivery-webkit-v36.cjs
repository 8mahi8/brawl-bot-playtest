// Real four-WebKit gameplay on a LOOPBACK RTDB emulator, using the actual
// normal 2v2 latency-candidate HTML. Production Firebase is never touched.
'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),http=require('node:http');
const {webkit}=require('playwright-core');
if(!/^(127\.0\.0\.1|localhost):9000$/.test(process.env.FIREBASE_DATABASE_EMULATOR_HOST||''))
 throw Error('Requires 127.0.0.1 Firebase emulator');
const dir=path.resolve(__dirname,'..'),sdk=path.join(dir,'artifacts/firebase-sdk');
const fakeUrl='https://demo-brawl-draft-beta-default-rtdb.firebaseio.com/';
assert.equal(process.env.BRAWL_STAGE_2V2,'1','V3.6 stress fixture may use only generated staging HTML');
const htmlPath=process.env.BRAWL_STAGE_2V2==='1'?'artifacts/friends-online/normal-2vs2.html':'sites/BRAWL_FRIENDS_2vs2_LATENCY_CANDIDATE.html';
let src=fs.readFileSync(path.join(dir,htmlPath),'utf8');
const before=' db=firebase.database();';
assert.equal(src.split(before).length-1,1,'unique SDK hook: fail closed');
src=src.replace(before,before+" db.useEmulator('127.0.0.1',9000);");
src=src.replace('connect-src ','connect-src http://127.0.0.1:9000 ws://127.0.0.1:9000 ');
const probe='window.__brawlV3QA=()=>({';
assert.equal(src.split(probe).length-1,1,'unique test hook');
src=src.replace(probe,"window.__testFireNormal2v2=(angle)=>{if(!combatReady()||!Number.isFinite(angle))return false;shootAngle(angle);return true;};\n"+probe);
// Test-only delay of ACTION listener delivery. This deliberately does NOT
// claim to throttle network packets or measure actual Firebase transport RTT.
const actionHook="watch(room.child('actions'),'child_added',snap=>{const a=snap.val();if(a&&snap.key)acceptAction({...a,eventId:snap.key});});";
assert.equal(src.split(actionHook).length-1,1,'stable test-only ACTION callback injection point');
function stressedHtml(delayMs){
 assert([0,180,350].includes(delayMs),'explicit bounded delivery profiles only');
 const handler=`window.__v36ActionDeliveryQA={configuredDelayMs:${delayMs},remoteShots:0,bombers:0,
   actualWaitMs:[],receivedAfterHostSnapshot:0};
 watch(room.child('actions'),'child_added',snap=>{
  const a=snap.val();if(!a||!snap.key)return;
  const arrivedAt=performance.now(),remote=a.owner!==myId;
  const deliver=()=>{
   if(remote&&a.type==='shot'){
    const qa=window.__v36ActionDeliveryQA;
    qa.remoteShots++;
    if(game?.stats?.[a.owner]?.lastActionSeq>=a.seq)qa.receivedAfterHostSnapshot++;
    qa.actualWaitMs.push(Math.round((performance.now()-arrivedAt)*10)/10);
    if(qa.actualWaitMs.length>60)qa.actualWaitMs.shift();
    if(game?.stats?.[a.owner]?.char==='bomber')qa.bombers++;
   }
   acceptAction({...a,eventId:snap.key});
  };
  const waitMs=window.__v36ActionDeliveryQA.configuredDelayMs;
  if(remote&&waitMs>0)setTimeout(deliver,waitMs);
  else deliver();
 });`;
 return src.replace(actionHook,handler);
}
const server=http.createServer((req,res)=>{
 const u=new URL(req.url,'http://127.0.0.1:8879');
 if(u.pathname!=='/normal'){res.writeHead(404);res.end();return;}
 const delay=Number(u.searchParams.get('deliveryLag')||0);
 if(![0,180,350].includes(delay)){res.writeHead(400);res.end('Invalid test delay');return;}
 res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});res.end(stressedHtml(delay));
});
async function open(browser,deliveryLag,capture=false){
 const videoDir=path.join(dir,'artifacts/qa/visual-v42');
 if(capture)fs.mkdirSync(videoDir,{recursive:true});
 const ctx=await browser.newContext({viewport:{width:1024,height:650},isMobile:true,hasTouch:true,deviceScaleFactor:1,locale:'ja-JP',
  ...(capture?{recordVideo:{dir:videoDir,size:{width:1024,height:650}}}:{})});
 const page=await ctx.newPage(),errors=[];
 page.on('pageerror',e=>errors.push('JS '+e.message));
 page.on('console',m=>{if(m.type()==='error')errors.push('CONSOLE '+m.text().slice(0,170));});
 await page.route('https://www.gstatic.com/firebasejs/10.8.0/*',async route=>{
  const name=route.request().url().split('/').pop();
  if(!['firebase-app-compat.js','firebase-database-compat.js'].includes(name))return route.abort();
  return route.fulfill({status:200,contentType:'application/javascript',body:fs.readFileSync(path.join(sdk,name))});
 });
 await page.goto('http://127.0.0.1:8879/normal?deliveryLag='+deliveryLag,{waitUntil:'load'});
 await page.waitForFunction(()=>typeof window.__brawlV3QA==='function',null,{timeout:17000});
 await page.locator('details.online-config summary').click();
 await page.locator('#onlineDbInput').fill(fakeUrl);
 return {ctx,page,errors,deliveryLag,capture};
}
async function run(){
 await new Promise(resolve=>server.listen(8879,'127.0.0.1',resolve));
 let browser,all=[];
 try{
  browser=await webkit.launch({headless:true});
  all=await Promise.all([0,0,0,0].map((ms,i)=>open(browser,ms,process.env.BRAWL_VISUAL_QA==='1'&&i<2)));
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
  // Seat assignment order differs from join order. Bind delays only AFTER
  // joining and resolving each player seat, never by client-array position.
  for(const [seat,delay]of [['red1',180],['blue2',350]]){
   const c=all[seats.findIndex(q=>q.seat===seat)];
   await c.page.waitForFunction(()=>!!window.__v36ActionDeliveryQA,null,{timeout:10000});
   const confirmed=await c.page.evaluate(ms=>{
    window.__v36ActionDeliveryQA.configuredDelayMs=ms;
    return window.__v36ActionDeliveryQA.configuredDelayMs;
   },delay);
   assert.equal(confirmed,delay,'injected delay selected by actual seat '+seat);
   c.deliveryLag=delay;
  }
  assert.equal(all[seats.findIndex(q=>q.seat==='red2')].deliveryLag,0,'baseline red2 unaffected');
  // A real player chooses Bomber. This specifically targets the school issue.
  await lookup.red2.locator('#charPick button[data-char="bomber"]').click();
  await lookup.red2.waitForFunction(()=>window.__brawlV3QA?.()?.lobby?.seats?.red2?.char==='bomber',null,{timeout:12000});
  // V4.0: exercise the real touch UI on all four iPad-sized WebKit pages.
  // Nothing is started by default. Players explicitly press the diagnostic
  // button before the match, and the recorder runs only in this browser.
  for(const c of all){
   assert.equal(await c.page.evaluate(()=>window.__brawlLagV40UI?.status().running),false);
   await c.page.locator('#brawlV40Open').click();
   await c.page.locator('#brawlV40Start').click();
   assert.equal(await c.page.evaluate(()=>window.__brawlLagV40UI?.status().running),true);
   assert.equal(await c.page.locator('#brawlV40Panel').isVisible(),false,
    'start hides diagnostics, keeping the arena accessible');
  }
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
   const q=window.__v36ActionDeliveryQA;
   return q?.remoteShots>0&&q.actualWaitMs.some(x=>x>=175);
  },null,{timeout:17000});
  assert.equal(await lookup.red2.evaluate(()=>window.__testFireNormal2v2(Math.PI)),true);
  await lookup.blue2.waitForFunction(()=>{
   const q=window.__v36ActionDeliveryQA;
   return q?.bombers>0&&q.actualWaitMs.some(x=>x>=345);
  },null,{timeout:17000});
  const d=await Promise.all([lookup.red1,lookup.blue2].map(p=>p.evaluate(()=>window.__brawlEarlyShotsQA())));
  // Deliberately delayed callbacks may lose early visuals when a host snapshot
  // already contains the accepted shot. This is an observation, not a pass gate.
  assert(d.every(v=>Number.isFinite(v.stats.incoming)));
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
    assert(result.presentation.renderedFrames>=0,'sampler remains safe under delayed callbacks');
    assert(!('pingMs' in result.traffic),'callback count must not be misreported as RTT');
    assert(!JSON.stringify(result).includes(roomId),'do not export room IDs');
   }
   console.log('PASS V3.6 staged-only local sampler stable under injected ACTION callback delay');
  }
  // Inspect real ACTION → screen/transaction stats after the two real shots.
  // The artificial callback delay tests the instrumentation only: no claim
  // about real mobile network ping, Firebase server latency, or school Wi-Fi.
  const v40Probes=[];
  for(const seat of ['blue1','red1','blue2','red2']){
   const page=lookup[seat];
   await page.locator('#brawlV40Open').click();
   await page.locator('#brawlV40Stop').click();
   const reportText=await page.locator('#brawlV40Result').inputValue();
   const qa=await page.evaluate(()=>window.__brawlLagV39QA.report());
   assert.equal(qa.version,'V3.9');
   assert(reportText.includes('BRAWL 2vs2 通信診断 V4.0'));
   assert(reportText.includes('pingではない'),'no fake ping claim on real iPad panel');
   assert(!reportText.includes(roomId),'no room IDs in copied UI text');
   assert(!JSON.stringify(qa).includes(roomId),'no room IDs in aggregate metrics');
   assert(qa.events.hostTransactions>=0&&qa.events.remoteShots>=0,
    'normal 2vs2 profiler reports numeric aggregate event counts');
   v40Probes.push({seatRole:seat,
    injectedActionCallbackDelayMs:all[seats.findIndex(q=>q.seat===seat)].deliveryLag||0,
    metrics:qa.stages,events:qa.events});
   await page.locator('#brawlV40Close').click();
  }
  assert(v40Probes.some(x=>x.events.remoteShots>0),'real remote shot listeners feed V3.9 report');
  assert(v40Probes.some(x=>x.events.hostTransactions>0),'host authority reports transactions');
  const v40Evidence={version:'V4.0',test:'FOUR real WebKit peers, LOCAL Firebase emulator only',
   caveat:'callback delay injection; NOT packet latency or Firebase RTT',
   profile:v40Probes};
  assert(!JSON.stringify(v40Evidence).includes(roomId),'no live room ID in evidence');
  fs.mkdirSync(path.join(dir,'artifacts/qa'),{recursive:true});
  fs.writeFileSync(path.join(dir,'artifacts/qa/v40-four-peer-shot-pipeline.json'),
    JSON.stringify(v40Evidence,null,2)+'\n');
  console.log('PASS V4.0 four mobile WebKit diagnosis panels, local stage timings and anonymous export');
  const afterHP=await host.evaluate(()=>window.__brawlV3QA().hp);
  assert.deepEqual(afterHP,beforeHP,'remote visual-only preview never changes HP across long map');
  for(const c of all)assert.deepEqual(c.errors,[],'no Safari/WebKit page errors');
  const probes=await Promise.all(['red1','blue2','red2'].map(async seat=>({
    seatRole:seat,configuredDeliveryMs:all[seats.findIndex(q=>q.seat===seat)].deliveryLag,
    qa:await lookup[seat].evaluate(()=>({...window.__v36ActionDeliveryQA}))
  })));
  for(const entry of probes.filter(x=>x.configuredDeliveryMs>0)){
   assert(entry.qa.remoteShots>0,'delayed peer receives actual shot events');
   assert(entry.qa.actualWaitMs.every(v=>v>=entry.configuredDeliveryMs-5),
    'actual callback wait matches injected floor');
  }
  const output={version:'V3.6',test:'real four-WebKit clients with LOCAL Firebase emulator',
   injection:'action-listener callback delay only; not network RTT',
   profiles:probes.map(x=>({seatRole:x.seatRole,configuredDelayMs:x.configuredDeliveryMs,
    remoteShots:x.qa.remoteShots,bombers:x.qa.bombers,
    afterAuthoritativeSnapshot:x.qa.receivedAfterHostSnapshot,
    observedHandlerWaitMs:x.qa.actualWaitMs}))};
  const target=path.join(dir,'artifacts/qa/v36-four-peer-delivery-lag.json');
  fs.mkdirSync(path.dirname(target),{recursive:true});
  fs.writeFileSync(target,JSON.stringify(output,null,2)+'\n');
  assert(!JSON.stringify(output).includes(roomId),'no room IDs in report');
  console.log('PASS V3.6 four WebKit peers, 180/350ms delayed action callback, authoritative accepted shots unchanged, bounded latency report '+target);
 }finally{
  await Promise.all(all.map(c=>c.ctx.close().catch(()=>{})));
  for(let i=0;i<all.length;i++)if(all[i].capture){
   const output=path.join(dir,'artifacts/qa/v42-normal-2v2-'+(i?'guest':'host')+'.webm');
   await all[i].page.video().saveAs(output);
   assert(fs.statSync(output).size>1000,'nonempty 2v2 match capture');
   console.log('PASS V4.2 local 2vs2 visual capture '+path.basename(output));
  }
  if(browser)await browser.close();
  await new Promise(resolve=>server.close(resolve));
 }
}
run().catch(e=>{console.error(e);process.exitCode=1;});
