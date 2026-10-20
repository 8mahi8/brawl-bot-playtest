// V4.3 four MOVING WebKit players and real action-stream shooting.
// Staging HTML and LOCAL Firebase emulator ONLY. Does not test school Wi-Fi.
'use strict';
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {webkit}=require('playwright-core');
const root=path.resolve(__dirname,'..'),sdk=path.join(root,'artifacts/firebase-sdk');
const out=path.join(root,'artifacts/qa'),host='127.0.0.1',port=8893;
const url='https://demo-brawl-draft-beta-default-rtdb.firebaseio.com/';
const SEATS=['blue1','blue2','red1','red2'],DURATION=27;
const order={blue1:['d','d','s','a','a','w','d','s','a'],blue2:['d','d','w','a','a','s','d','w','a'],
 red1:['a','a','s','d','d','w','a','s','d'],red2:['a','a','w','d','d','s','a','w','d']};
if(!/^(127\.0\.0\.1|localhost):9000$/.test(process.env.FIREBASE_DATABASE_EMULATOR_HOST||''))
 throw Error('LOCAL RTDB emulator only');
if(process.env.BRAWL_STAGE_2V2!=='1')throw Error('Generated staging 2v2 only');
function fixture(mode){
 const input=path.join(root,'artifacts/friends-online/'+mode+'-2vs2.html');
 let s=fs.readFileSync(input,'utf8');
 if(process.env.BRAWL_V47_INDEX_EARLY_SHOTS==='1'){
  // Candidate only in this local-emulator WebKit fixture; no generated
  // release or pinned source HTML is modified.
  const {makeAll}=require('../scripts/build-friends-online.cjs');
  const indexed=fs.readFileSync(path.join(root,'shared/runtime/friends-2v2-early-shots-v47.inc.js'),'utf8');
  s=makeAll(indexed)[mode+'.2vs2'].html;
 }
 // Existing draft beta has a preconfigured RTDB URL and deliberately hides
 // the connection editor. Redirect that URL to the emulator-only project.
 if(mode==='draft')s=s.replaceAll('https://mygame-df915-default-rtdb.firebaseio.com/',url);
 const a=' db=firebase.database();',b='window.__brawlV3QA=()=>({';
 const listener="watch(room.child('actions'),'child_added',snap=>{const a=snap.val();if(a&&snap.key)acceptAction({...a,eventId:snap.key});});";
 for(const anchor of [a,b,listener])assert.equal(s.split(anchor).length-1,1,'unique '+mode+' anchor');
 s=s.replace(a,a+" db.useEmulator('127.0.0.1',9000);");
 s=s.replace('connect-src ','connect-src http://127.0.0.1:9000 ws://127.0.0.1:9000 ');
 if(process.env.BRAWL_V46_BASELINE_ACTIONS==='1'){
  const mark=' renderEarlyShots(performance.now());';
  assert.equal(s.split(mark).length-1,1,'one real Canvas shot-preview render');
  s=s.replace(mark,` {const __start=performance.now(),__active=earlyShots.size;
  renderEarlyShots(__start);
  const __elapsed=performance.now()-__start,__m=window.__v47FrameQA;
  __m.calls++;__m.totalMs+=__elapsed;__m.maxMs=Math.max(__m.maxMs,__elapsed);
  if(__active)__m.activeCalls++;
  if(__active>=4)__m.denseCalls++;
  }`);
 }
 // Extra V4.5 test-only switch: all 4 clients still run the real movement,
 // RTDB listeners, action dispatch, and collision. Toggle only guest Canvas
 // rendering for a controlled shared-runner CPU-load comparison.
 if(process.env.BRAWL_V45_ISOLATE_CANVAS==='1'){
  const canvasAnchor='function shouldDrawCanvasFrame(now){';
  assert.equal(s.split(canvasAnchor).length-1,1,'one canvas frame policy');
  s=s.replace(canvasAnchor,"window.__v45CanvasQA={enabled:true};\n"+
   'function shouldDrawCanvasFrame(now){if(!window.__v45CanvasQA.enabled)return false;');
 }
 // QA-only readable data and a call into the genuine production shootAngle().
 // Real movement uses the actual keyboard event handlers, not pose mutation.
 const qa=[
 'window.__v47FrameQA={calls:0,totalMs:0,maxMs:0,activeCalls:0,denseCalls:0};',
 'window.__v43QA=Object.freeze({',
 ' shoot:angle=>{if(!combatReady()||game?.phase!==\'playing\')return false;',
 ' const before=actionSeq;shootAngle(angle);return actionSeq>before;},',
 ' state:()=>({phase:game?.phase,local:{x:local.x,y:local.y},',
 ' remotes:Object.values(remotes).filter(p=>Number.isFinite(p.x)).length,',
 ' bullets:bulletVisuals.size,early:earlyShotStats.incoming,',
 ' frames:workTiming.frameSamples,frameGaps:workTiming.frameGapOver100,',
 ' gameCallbacks:workTiming.gameSnapshots,gameCallbackTotalMs:workTiming.gameSnapshotTotalMs,',
 ' gameCallbackMaxMs:workTiming.gameSnapshotMaxMs,',
 ' hudRenders:presentationMetrics.hudRenders,hudDomWrites:presentationMetrics.hudDomWrites,',
 ' now:performance.now(),',
 ' hudV45:window.__brawlHudV45QA?.()||null,',
 ' earlyFrame:window.__v47FrameQA?{...window.__v47FrameQA}:null,',
 ' canvasDrawMs:drawTiming.totalDrawMs,draws:drawTiming.frames})',
 '});'
 ].join('\n');
 s=s.replace(b,qa+'\n'+b);
 if(process.env.BRAWL_V49_RENDER_PHASES==='1'){
  const {instrumentV49}=require('./support/friends-2v2-render-patch-v49.cjs');
  const v49=fs.readFileSync(path.join(root,'tests/support/friends-2v2-render-phases-v49.js'),'utf8');
  s=instrumentV49(s,v49);
 }
 // One receiver has callback-only delay. This is NOT a network RTT simulation.
 const callback=[
 'window.__v43DelayQA={ms:0,remoteActions:0};',
 "watch(room.child('actions'),'child_added',snap=>{const a=snap.val();if(!a||!snap.key)return;",
 ' const run=()=>{if(a.owner!==myId&&a.type===\'shot\')window.__v43DelayQA.remoteActions++;',
 ' acceptAction({...a,eventId:snap.key});};',
 ' if(a.owner!==myId&&a.type===\'shot\'&&window.__v43DelayQA.ms)setTimeout(run,window.__v43DelayQA.ms);',
 ' else run();});'
 ].join('\n');
 return s.replace(listener,callback);
}
const pages={'/normal':fixture('normal'),'/draft':fixture('draft')};
const server=http.createServer((req,res)=>{
 const html=pages[req.url];if(!html){res.writeHead(404);res.end();return;}
 res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});res.end(html);
});
async function open(browser,mode,capture){
 const dir=path.join(out,'v43-videos');if(capture)fs.mkdirSync(dir,{recursive:true});
 const settings={viewport:{width:1024,height:650},isMobile:true,hasTouch:true,deviceScaleFactor:1,locale:'ja-JP'};
 if(capture)settings.recordVideo={dir,size:{width:1024,height:650}};
 const ctx=await browser.newContext(settings),page=await ctx.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 page.on('console',e=>{if(e.type()==='error')errors.push(e.text().slice(0,160));});
 await page.route('https://www.gstatic.com/firebasejs/10.8.0/*',async route=>{
  const name=route.request().url().split('/').pop();
  if(!['firebase-app-compat.js','firebase-database-compat.js'].includes(name))return route.abort();
  return route.fulfill({status:200,contentType:'application/javascript',body:fs.readFileSync(path.join(sdk,name))});
 });
 await page.goto('http://'+host+':'+port+'/'+mode,{waitUntil:'load'});
 await page.waitForFunction(()=>!!window.__v43QA&&typeof window.__brawlV3QA==='function',null,{timeout:16000});
 const editor=page.locator('details.online-config summary');
 if(await editor.isVisible()){
  await editor.click();await page.locator('#onlineDbInput').fill(url);
 }else{
  // Draft mode hides this advanced editor; assign its value internally
  // without forcing a nonexistent interactive action.
  await page.locator('#onlineDbInput').evaluate((el,v)=>{el.value=v;},url);
 }
 return {ctx,page,errors,capture};
}
async function key(page,k,pressed){
 await page.evaluate(v=>{
  window.dispatchEvent(new KeyboardEvent(v.pressed?'keydown':'keyup',
   {key:v.k,bubbles:true,cancelable:true}));
 },{k,pressed});
}
async function trial(mode,browser){
 let clients=[],result;
 try{
  const isolated=process.env.BRAWL_V45_ISOLATE_CANVAS==='1';
  const natural=process.env.BRAWL_V46_BASELINE_ACTIONS==='1';
  const indexed=process.env.BRAWL_V47_INDEX_EARLY_SHOTS==='1';
  const renderPhases=process.env.BRAWL_V49_RENDER_PHASES==='1';
  const v50=process.env.BRAWL_V50_CANVAS_CPU_SPLIT==='1';
  assert(!v50||(isolated&&natural&&renderPhases&&!indexed),
   'V5.0 requires 4 networked WebKit clients, natural shot callbacks and the frame-phase probe');
  assert(!renderPhases||(natural&&!indexed&&(!isolated||v50)),
   'V4.9 normal baseline must keep all guest Canvas renderers active');
  assert(!indexed||natural,'V4.7 candidate only alongside V4.6 natural no-injected-delay baseline');
  assert(!(isolated&&natural&&!v50),'V4.6 natural action baseline must not disable guest Canvas');
  // No video encoding while establishing natural callback timings; the
  // existing V4.3 video test still records normal and draft UI screenshots.
  clients=await Promise.all(SEATS.map((_,i)=>open(browser,mode,!isolated&&!natural&&i<2)));
  const first=clients[0].page;
  await first.locator('#createBtn').click();
  await first.waitForFunction(()=>/^\d{5}$/.test(window.__brawlV3QA?.()?.roomId||''),null,{timeout:18000});
  const roomId=(await first.evaluate(()=>window.__brawlV3QA())).roomId;
  for(const c of clients.slice(1)){
   await c.page.locator('#roomInput').fill(roomId);
   await c.page.locator('#joinBtn').click();
   await c.page.waitForFunction(id=>{
    const q=window.__brawlV3QA?.();return q?.roomId===id&&!!q?.seat;
   },roomId,{timeout:17000});
  }
  const joined=await Promise.all(clients.map(c=>c.page.evaluate(()=>window.__brawlV3QA())));
  assert.deepEqual(joined.map(q=>q.seat).sort(),SEATS.slice().sort());
  const bySeat=Object.fromEntries(joined.map((q,i)=>[q.seat,clients[i].page]));
  const chars={blue1:'gunner',blue2:'tank',red1:'sniper',red2:'bomber'};
  for(const seat of SEATS){
   await bySeat[seat].locator('#charPick button[data-char="'+chars[seat]+'"]').click();
   await bySeat[seat].waitForFunction(v=>{
    return window.__brawlV3QA?.()?.lobby?.seats?.[v.seat]?.char===v.char;
   },{seat,char:chars[seat]},{timeout:13000});
  }
  // The receiver with callback delay still sees official game snapshots normally.
  if(!natural)await bySeat.red1.evaluate(()=>{window.__v43DelayQA.ms=180;});
  for(const c of clients)await c.page.locator('#readyBtn').click();
  await Promise.all(clients.map(c=>c.page.waitForFunction(()=>{
   const q=window.__brawlV3QA?.();
   return q?.game==='playing'&&q.scene==='game'&&q.online===4&&q.combatReadyNow;
  },null,{timeout:27000})));
  // iPad legibility: no diagnostic toggle covering the top-center score HUD.
  const ui=await first.evaluate(()=>{
   const d=document.getElementById('brawlV40Open').getBoundingClientRect();
   const score=document.getElementById('roundInfo').getBoundingClientRect();
   const overlap=d.left<score.right&&d.right>score.left&&d.top<score.bottom&&d.bottom>score.top;
   return {buttonTop:d.top,viewportHeight:innerHeight,overlap};
  });
  assert(!ui.overlap&&ui.buttonTop>ui.viewportHeight-65,
   'manual network diagnosis never masks live match score');
  for(const c of clients)await c.page.evaluate(()=>{
   window.__brawlLagV39QA.start();
   window.__v49ShotFrames?.start();
  });
  const startedVisual=await Promise.all(SEATS.map(async seat=>({
   seat,state:await bySeat[seat].evaluate(()=>window.__v43QA.state())
  })));
  if(process.env.BRAWL_STAGE_2V2==='1')
   assert(startedVisual.every(p=>p.state.gameCallbacks>=0),'staged 2v2 game CPU profiling is available');
  const boundaries={};
  const v50Segments=[];
  if(isolated)boundaries.allStart=await first.evaluate(()=>window.__v43QA.state());
  const progress=Object.fromEntries(SEATS.map(s=>[s,[]]));
  const shots=Object.fromEntries(SEATS.map(s=>[s,0]));
  const keys=Object.fromEntries(SEATS.map(s=>[s,null]));
  for(let sec=0;sec<DURATION;sec++){
   if(isolated&&sec===10){
    boundaries.allEnd=await first.evaluate(()=>window.__v43QA.state());
    if(v50)v50Segments.push({
     segment:'fourCanvas',
     frames:await first.evaluate(()=>window.__v49ShotFrames.stop())
    });
    await Promise.all(clients.slice(1).map(c=>c.page.evaluate(()=>{
     window.__v45CanvasQA.enabled=false;
    })));
    if(v50)await first.evaluate(()=>window.__v49ShotFrames.start());
    boundaries.singleStart=await first.evaluate(()=>window.__v43QA.state());
    boundaries.guestsStart=await Promise.all(clients.slice(1).map(c=>
     c.page.evaluate(()=>window.__v43QA.state())));
   }
   if(isolated&&sec===21){
    boundaries.singleEnd=await first.evaluate(()=>window.__v43QA.state());
    boundaries.guestsEnd=await Promise.all(clients.slice(1).map(c=>
     c.page.evaluate(()=>window.__v43QA.state())));
    if(v50)v50Segments.push({
     segment:'oneCanvas',
     frames:await first.evaluate(()=>window.__v49ShotFrames.stop())
    });
    await Promise.all(clients.slice(1).map(c=>c.page.evaluate(()=>{
     window.__v45CanvasQA.enabled=true;
    })));
    if(v50)await first.evaluate(()=>window.__v49ShotFrames.start());
   }
   const index=Math.floor(sec/3);
   await Promise.all(SEATS.map(async seat=>{
    const next=order[seat][index%order[seat].length],page=bySeat[seat];
    if(keys[seat]!==next){
     if(keys[seat])await key(page,keys[seat],false);
     await key(page,next,true);keys[seat]=next;
    }
   }));
   if(sec%2===0){
    await Promise.all(SEATS.map(async seat=>{
     const page=bySeat[seat],angle=(seat.startsWith('blue')?0:Math.PI)+
      (Math.floor(sec/4)%3-1)*.38;
     if(await page.evaluate(a=>window.__v43QA.shoot(a),angle))shots[seat]++;
    }));
   }
   await new Promise(r=>setTimeout(r,1000));
   for(const seat of SEATS)progress[seat].push(await bySeat[seat].evaluate(()=>window.__v43QA.state()));
   if(!natural&&[6,15,24].includes(sec+1)){
    for(const seat of ['blue1','red1'])await bySeat[seat].screenshot({
     path:path.join(out,'v43-'+mode+'-'+seat+'-'+(sec+1)+'s.png')});
   }
  }
  await Promise.all(SEATS.map(seat=>keys[seat]?key(bySeat[seat],keys[seat],false):Promise.resolve()));
  const travel={};
  for(const seat of SEATS){
   const p=progress[seat];let distance=0;
   for(let i=1;i<p.length;i++)distance+=Math.hypot(p[i].local.x-p[i-1].local.x,
    p[i].local.y-p[i-1].local.y);
   travel[seat]=Math.round(distance);
  }
  if(isolated)boundaries.resumedEnd=await first.evaluate(()=>window.__v43QA.state());
  const reports=await Promise.all(SEATS.map(async seat=>{
   const page=bySeat[seat];
   return {seat,
    visual:await page.evaluate(()=>window.__v43QA.state()),
    latency:await page.evaluate(()=>window.__brawlLagV39QA.stop()),
    renderPhases:renderPhases?await page.evaluate(()=>window.__v49ShotFrames.stop()):null,
    received:await page.evaluate(()=>window.__v43DelayQA.remoteActions)};
  }));
  assert(Object.values(travel).filter(x=>x>=90).length>=2,
   'At least two active player trajectories required, not standing still');
  assert(Object.values(shots).reduce((a,b)=>a+b,0)>=7,'actual shot bus must receive seven shots');
  assert(reports.some(r=>r.received>=3),'guests must observe multiple remote action events');
  assert(reports.some(r=>r.visual.remotes>=3),'remote player draw positions must exist');
  for(const c of clients)assert.deepEqual(c.errors,[],'WebKit JS error '+mode);
  result={version:v50?'V5.0':renderPhases?'V4.9':indexed?'V4.7':natural?'V4.6':'V4.5',mode,description:'Scripted 4-peer movement and shooting, WebKit/LOCAL RTDB only',
   durationSec:DURATION,shots,travelWorldUnits:travel,characters:chars,
   receiverCallbackOnlyDelayMs:natural?{}:{red1:180},noSchoolNetworkRTT:true,
   peers:reports.map(r=>{
    const initial=startedVisual.find(s=>s.seat===r.seat).state;
    const final=r.visual;
    return {seat:r.seat,received:r.received,
     finalFrame:final,
     localCpu:{gameSnapshotCallbacks:final.gameCallbacks-initial.gameCallbacks,
      gameCallbackWorkMs:Math.round((final.gameCallbackTotalMs-initial.gameCallbackTotalMs)*100)/100,
      maxGameCallbackMs:final.gameCallbackMaxMs,
      hudRenderingCount:final.hudRenders-initial.hudRenders,
      hudDomWrites:final.hudDomWrites-initial.hudDomWrites,
      hudExperimentEnabled:!!final.hudV45,
      hudCoalesced:final.hudV45&&initial.hudV45?
       final.hudV45.coalesced-initial.hudV45.coalesced:null,
      hudFlushed:final.hudV45&&initial.hudV45?
       final.hudV45.flushed-initial.hudV45.flushed:null,
      hudMaxWaitMs:final.hudV45?.maxWaitMs??null},
     lagStages:r.latency.stages,events:r.latency.events};
   })};
  if(isolated){
   const segment=(start,end)=>({
    seconds:Math.round((end.now-start.now)/100)/10,
    fps:Math.round((end.frames-start.frames)*100000/(end.now-start.now))/100,
    frames:end.frames-start.frames,canvasFrames:end.draws-start.draws,
    frameGapsOver100:end.frameGaps-start.frameGaps,
    gameSnapshots:end.gameCallbacks-start.gameCallbacks,
    gameCpuMs:Math.round((end.gameCallbackTotalMs-start.gameCallbackTotalMs)*100)/100
   });
   result.frameIsolation={
    meaning:'Same 4 active Firebase clients; comparing 4 Canvas renderers vs 1 Canvas renderer on ONE CI host. Not one browser or school FPS.',
    fourCanvas:segment(boundaries.allStart,boundaries.allEnd),
    oneCanvas:segment(boundaries.singleStart,boundaries.singleEnd),
    resumedFourCanvas:segment(boundaries.singleEnd,boundaries.resumedEnd),
    guestDrawsSuppressed:boundaries.guestsStart.map((start,i)=>
     boundaries.guestsEnd[i].draws-start.draws)
   };
   assert(result.frameIsolation.guestDrawsSuppressed.every(x=>x===0),
    'three guest Canvas renderers paused only during controlled CPU isolation');
   if(!v50){
    fs.writeFileSync(path.join(out,'v45-canvas-isolation-'+mode+'.json'),
     JSON.stringify(result.frameIsolation,null,2)+'\n');
    console.log('PASS V4.5 Canvas isolation '+mode+' '+JSON.stringify(result.frameIsolation));
   }
  }
  assert(!JSON.stringify(result).includes(roomId),'anonymous aggregate report only');
  if(natural){
   // Persist only bounded aggregate timings, never room keys or event IDs.
   const baseline={
    version:'V4.6',mode,peers:4,trialSeconds:DURATION,
    setup:'four real moving/shooting WebKit clients and LOCAL RTDB emulator',
    injectedCallbackDelayMs:0,videoCaptureEnabled:false,
    limitations:['Not school Wi-Fi or a physical iPad FPS measurement',
     'Server clock offsets prevent a true end-to-end packet RTT estimate',
     'CI shares CPU across all four WebKit peers and the Firebase emulator',
     'Visual timing ends at Canvas draw submission, not display scanout'],
    seats:result.peers.map(p=>({
     seat:p.seat,remoteActions:p.received,
     stages:p.lagStages,events:p.events,
     gameCpu:p.localCpu,
     renderPhases:renderPhases?reports.find(x=>x.seat===p.seat).renderPhases:null,
     earlyFrame:{
      calls:p.finalFrame.earlyFrame.calls -
       startedVisual.find(s=>s.seat===p.seat).state.earlyFrame.calls,
      activeCalls:p.finalFrame.earlyFrame.activeCalls -
       startedVisual.find(s=>s.seat===p.seat).state.earlyFrame.activeCalls,
      denseCalls:p.finalFrame.earlyFrame.denseCalls -
       startedVisual.find(s=>s.seat===p.seat).state.earlyFrame.denseCalls,
      totalMs:Math.round((p.finalFrame.earlyFrame.totalMs -
       startedVisual.find(s=>s.seat===p.seat).state.earlyFrame.totalMs)*100)/100,
      maxMs:Math.round(p.finalFrame.earlyFrame.maxMs*100)/100
     },
     totalFrames:p.finalFrame.frames,framesOver100ms:p.finalFrame.frameGaps
    }))
   };
   assert(baseline.seats.every(p=>p.events.remoteShots>=1),
    'natural 4-peer baseline must actually receive remote shots on every client');
   if(v50){
    const hostSeat=joined[0].seat;
    const host=baseline.seats.find(p=>p.seat===hostSeat);
    assert(host,'host report must be present');
    v50Segments.push({segment:'resumedFourCanvas',frames:host.renderPhases});
    assert.deepEqual(v50Segments.map(x=>x.segment),
     ['fourCanvas','oneCanvas','resumedFourCanvas']);
    const names=['fourCanvas','oneCanvas','resumedFourCanvas'];
    const segments=v50Segments.map((x,i)=>({
     phase:x.segment,
     renderedCanvases:i===1?1:4,
     // Every duration and quantile here was measured on the SAME WebKit host page.
     hostFrame:result.frameIsolation[names[i]],
     events:x.frames.events,
     stages:x.frames.stages,
     caveats:x.frames.caveats
    }));
    assert(segments.every(s=>s.events.remoteActions>=4&&
      s.events.firstFrames===s.events.remoteActions),
     'every segment must capture genuine incoming remote shots and first rAF callbacks');
    assert(segments.some(s=>s.events.firstVisuals>0),
     'at least one segment must have a visible remote shot');
    const total=segments.reduce((sum,x)=>sum+x.events.remoteActions,0);
    assert.equal(total,host.events.remoteShots,
     'segmented remote ACTION totals must equal independent V3.9 host count');
    baseline.version='V5.0';
    baseline.segments=segments;
    baseline.hostSeat=hostSeat;
    baseline.frameIsolation=result.frameIsolation;
    baseline.limitations.push('4→1→4 Canvas still runs 4 WebKit pages on one CI host; it is not a physical iPad alone');
    const summary=segments.map(s=>({
     phase:s.phase,activeCanvas:s.renderedCanvases,
     fps:s.hostFrame.fps,framesOver100ms:s.hostFrame.frameGapsOver100,
     received:s.events.remoteActions,
     visuals:s.events.firstVisuals,
     receiveToFrameP50Ms:s.stages.receiveToNextFrameMs.p50Ms,
     receiveToFrameP95Ms:s.stages.receiveToNextFrameMs.p95Ms,
     firstFrameToVisualP95Ms:s.stages.nextFrameToFirstVisualMs.p95Ms,
     skippedWhilePending:s.events.skippedDrawDecisionsWhilePending
    }));
    console.log('PASS V5.0 '+mode+' matched host 4→1→4 Canvas render load '+JSON.stringify(summary));
   }
   const target=path.join(out,v50?'v50-'+mode+'-canvas-load-shot-phases.json':
    renderPhases?'v49-'+mode+'-frame-shot-pipeline.json':
    (indexed?'v47-':'v46-')+mode+(indexed?'-indexed-shot-pipeline.json':'-natural-shot-pipeline.json'));
   fs.writeFileSync(target,JSON.stringify(baseline,null,2)+'\n');
   const summary=baseline.seats.map(p=>({
    seat:p.seat,remoteShots:p.events.remoteShots,hostTransactions:p.events.hostTransactions,
    writeAckP95Ms:p.stages.writeAckMs.p95Ms,
    receiveToVisualP95Ms:p.stages.receiveToFirstVisualMs.p95Ms,
    receiveToReceiptP95Ms:p.stages.receiveToReceiptMs.p95Ms,
    hostQueueP95Ms:p.stages.hostQueueWaitMs.p95Ms,
    hostTransactionP95Ms:p.stages.hostTransactionMs.p95Ms,
    totalFrames:p.totalFrames,framesOver100ms:p.framesOver100ms,
    activeEarlyShotDraws:p.earlyFrame.activeCalls,denseEarlyShotDraws:p.earlyFrame.denseCalls,
    earlyShotTotalDrawMs:p.earlyFrame.totalMs
   }));
   if(renderPhases&&!v50){
    assert(baseline.seats.every(x=>x.renderPhases.events.remoteActions===x.events.remoteShots),
     'V4.9 phases must count ONLY genuine remote shot ACTIONs, never own shots');
    const phases=baseline.seats.map(x=>({seat:x.seat,
     remoteActions:x.renderPhases.events.remoteActions,
     firstFrames:x.renderPhases.events.firstFrames,
     firstVisuals:x.renderPhases.events.firstVisuals,
     skippedDrawWhilePending:x.renderPhases.events.skippedDrawDecisionsWhilePending,
     toFrameP95:x.renderPhases.stages.receiveToNextFrameMs.p95Ms,
     frameToVisualP95:x.renderPhases.stages.nextFrameToFirstVisualMs.p95Ms,
     toVisualP95:x.renderPhases.stages.receiveToFirstVisualMs.p95Ms}));
    assert(phases.every(x=>x.remoteActions>=20),
     'each browser received real remote ACTIONs during the 27s trial');
    assert(phases.some(x=>x.firstVisuals>0),
     'actual Canvas early/authoritative bullet visuals must be observed');
    console.log('PASS V4.9 '+mode+' real shot frame phases '+JSON.stringify(phases));
   }else if(!v50)console.log('PASS '+(indexed?'V4.7 indexed':'V4.6 natural')+' '+mode+' action stages '+JSON.stringify(summary));
  }else{
   fs.writeFileSync(path.join(out,'v43-'+mode+'-motion.json'),JSON.stringify(result,null,2)+'\n');
   console.log('PASS V4.3 '+mode+' moving multiplayer '+JSON.stringify({shots,travel}));
  }
  return result;
 }finally{
  await Promise.allSettled(clients.map(c=>c.ctx.close()));
  for(let i=0;i<clients.length;i++)if(clients[i].capture){
   const filename=path.join(out,'v43-'+mode+'-'+(i?'guest':'host')+'.webm');
   await clients[i].page.video().saveAs(filename);
   assert(fs.statSync(filename).size>1000,'capture nonempty '+filename);
   console.log('CAPTURE '+path.basename(filename));
  }
 }
}
async function main(){
 fs.mkdirSync(out,{recursive:true});
 await new Promise(resolve=>server.listen(port,host,resolve));
 let browser;
 try{
  browser=await webkit.launch({headless:true});
  const both=process.env.BRAWL_V50_CANVAS_CPU_SPLIT==='1';
  for(const mode of process.env.BRAWL_V45_ISOLATE_CANVAS==='1'&&!both?['normal']:['normal','draft'])
   await trial(mode,browser);
  console.log('PASS V4.3 two live-motion 27s 4-peer trials');
 }finally{
  if(browser)await browser.close();
  await new Promise(resolve=>server.close(resolve));
 }
}
main().catch(e=>{console.error(e);process.exitCode=1;});
