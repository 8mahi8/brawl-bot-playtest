// Run REAL browser clients against a LOCAL RTDB emulator. No cloud, deploy, or real credentials.
'use strict';
const fs=require('node:fs'),http=require('node:http'),assert=require('node:assert/strict'),path=require('node:path');
const {webkit}=require('playwright-core');
if(!/^(127\.0\.0\.1|localhost):9000$/.test(process.env.FIREBASE_DATABASE_EMULATOR_HOST||''))throw Error('LOCAL Firebase RTDB emulator required');
const root=path.resolve(__dirname,'..'),sdk=path.join(root,'artifacts','firebase-sdk'),url='https://demo-brawl-online-default-rtdb.firebaseio.com';
const ports=8765, errors=[];
const specs=[
 {mode:'duel',file:'online/ipad-duel-v2-lab.html',qa:'__brawlV29QA',stage:'#appStage',joinPanel:'#openJoinPanel',hostLabel:'#lobbyStatus',startLabel:'playing',codeSelector:'#roomCode'},
 {mode:'squad',file:'online/ipad-squad-v2-lab.html',qa:'__brawlV3QA',stage:'#app',joinPanel:null,hostLabel:'#homeStatus',startLabel:'playing',codeSelector:'#roomCode'}
];
function patched(spec){
 let src=fs.readFileSync(path.join(root,spec.file),'utf8');
 const origin=spec.mode==='duel'?'    db=firebase.database();':' db=firebase.database();';
 assert.equal(src.split(origin).length-1,1,'Firebase SDK creation hook '+spec.mode);
 src=src.replace(origin,origin+'\n'+(spec.mode==='duel'?'    ':' ')+"db.useEmulator('127.0.0.1',9000);");
 src=src.replace('connect-src ', 'connect-src http://127.0.0.1:9000 ws://127.0.0.1:9000 ');
 assert(src.includes("db.useEmulator('127.0.0.1',9000)"));
 return src;
}
const htmls=Object.fromEntries(specs.map(s=>[s.mode,patched(s)]));
const server=http.createServer((req,res)=>{
 const mode=req.url==='/duel'?'duel':req.url==='/squad'?'squad':null;
 if(!mode){res.writeHead(404);res.end('not found');return;}
 res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});
 res.end(htmls[mode]);
});
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function context(browser,mode,who){
 const ctx=await browser.newContext({viewport:{width:1024,height:620},hasTouch:true,isMobile:true,deviceScaleFactor:mode==='squad'&&who==='client0'?2:1,locale:'ja-JP'});
 const page=await ctx.newPage();
 const issues=[];
 page.on('pageerror',e=>issues.push('JS '+String(e.message)));
 page.on('console',m=>{if(m.type()==='error')issues.push('console '+m.text().slice(0,240));});
 await page.route('https://www.gstatic.com/firebasejs/10.8.0/*',async route=>{
  const name=route.request().url().split('/').pop();
  const file=path.join(sdk,name);
  if(!['firebase-app-compat.js','firebase-database-compat.js'].includes(name)||!fs.existsSync(file))return route.abort();
  return route.fulfill({status:200,contentType:'application/javascript',body:fs.readFileSync(file)});
 });
 await page.goto('http://127.0.0.1:'+ports+'/'+mode,{waitUntil:'load'});
 await page.waitForFunction(key=>typeof window[key]==='function',specs.find(x=>x.mode===mode).qa);
 await page.locator('details.online-config summary').click();
 await page.locator('#onlineDbInput').fill(url);
 return {ctx,page,issues,who};
}
async function snap(client,spec){return client.page.evaluate(k=>window[k](),spec.qa);}
async function waitState(client,spec,fn,timeout=20000){
 await client.page.waitForFunction(({k,matcher})=>{
  const q=window[k]?.(); if(!q)return false;
  if(matcher==='room')return /^\d{5}$/.test(q.roomId||'');
  if(matcher==='game')return (q.game?.phase||q.game)==='playing'&&(q.scene==='game');
  if(matcher==='select')return q.scene==='select';
  if(matcher==='lobby')return q.scene==='lobby';
  return false;
 },{k:spec.qa,matcher:fn},{timeout});
}
async function hostRoom(client,spec){
 await client.page.locator('#createBtn').click();
 await waitState(client,spec,'room');
 const q=await snap(client,spec);
 assert(/^\d{5}$/.test(q.roomId)); return q.roomId;
}
async function guestRoom(client,spec,id,bot){
 if(spec.joinPanel)await client.page.locator(spec.joinPanel).click();
 await client.page.locator('#roomInput').fill(id);
 await client.page.locator(bot?'#joinBotBtn':'#joinBtn').click();
 await delay(1200);
 if(spec.mode==='squad')console.log('SQUAD JOIN ATTEMPT '+id+' : '+(await client.page.locator('#homeStatus').innerText()));
 await waitState(client,spec,'room',11000);
}
async function startMatch(clients,spec,botIndex){
 for(const [i,c] of clients.entries()){
  if(i===botIndex)continue;
  await c.page.locator('#readyBtn').click();
  await delay(170);
 }
 for(const c of clients)await waitState(c,spec,'game',32000);
 const qs=await Promise.all(clients.map(c=>snap(c,spec)));
 assert(qs.every(q=>(q.game?.phase||q.game)==='playing'));
 if(spec.mode==='duel')assert(qs.every(q=>q.game?.round===1&&q.game?.hp?.host===160),'duel HP must use Tank 160');
 else assert(qs.every(q=>q.online===4&&q.game==='playing'&&q.combat&&q.combat.hp),'squad four-seat combat');
 return qs;
}
async function run(browser,spec,count,botIndex=-1){
 const clients=[];
 try{
  for(let i=0;i<count;i++)clients.push(await context(browser,spec.mode,'client'+i));
  const id=await hostRoom(clients[0],spec);
  for(let i=1;i<count;i++)await guestRoom(clients[i],spec,id,i===botIndex);
  for(const c of clients){if(spec.mode==='duel')await waitState(c,spec,'select');else await waitState(c,spec,'lobby');}
  await startMatch(clients,spec,botIndex);
  console.log('PASS '+spec.mode+' '+count+' clients'+(botIndex>0?' with BOT guest':'')+': ONLINE room '+id+' all connected, READY, game start; Tank 160 when applicable');
  if(spec.mode==='duel'&&botIndex<0){
   const shooter=clients[0],other=clients[1];
   const startAt=(await snap(shooter,spec)).game.startAt;
   await delay(Math.max(200,Math.min(5000,startAt-Date.now()+350)));
   const before=(await snap(other,spec)).remote?.targetX,hostBefore=(await snap(shooter,spec)).local.x;
   await shooter.page.keyboard.down('d');await delay(620);await shooter.page.keyboard.up('d');
   const hostAfter=(await snap(shooter,spec)).local.x;
   assert(hostAfter>hostBefore+5,'actual local keyboard movement must work: '+hostBefore+' to '+hostAfter);
   await other.page.waitForFunction(({key,x})=>window[key]?.()?.remote?.targetX>x+5,{key:spec.qa,x:before},{timeout:9000});
   const after=(await snap(other,spec)).remote?.targetX;
   assert(after>before+5,'real RTDB position update must arrive at other browser');
   console.log('PASS duel remote position replicated to second WebKit tab: x '+before+' -> '+after);
  }
  if(spec.mode==='squad'){
   const shooter=clients[0],observer=clients[1],q=await snap(shooter,spec);
   // The host runs at device DPR 2 (retina iPad simulation). Each other
   // browser retains DPR 1 to keep the CI workload representative, not 4x.
   await shooter.page.waitForFunction(k=>{
    const m=window[k]?.()?.canvasMetrics;
    return m&&m.backingWidth>0&&m.backingHeight>0&&m.renderScale<=2;
   },spec.qa,{timeout:8000});
   const px=(await snap(shooter,spec)).canvasMetrics,raw=px.cssWidth*px.cssHeight*4;
   const pixels=px.backingWidth*px.backingHeight;
   assert(pixels<=Math.max(px.cssWidth*px.cssHeight,px.maxGameplayPixels)+5000,
    'retina iPad canvas respects gameplay pixel ceiling: '+JSON.stringify(px));
   if(raw>px.maxGameplayPixels*1.03)assert(pixels<raw*.95,'retina raster budget must actually reduce backing pixels');
   console.log('PERF squad host retina DPR2: '+Math.round(raw)+' raw vs '+pixels+
     ' capped backing pixels ('+Math.round(pixels/Math.max(1,raw)*100)+'%) '+
     JSON.stringify(px));
   assert(q.drawTiming?.skippedCoveredFrames>0,
    'home/lobby covered rAF frames must not waste Canvas paint');
   assert.equal(Object.keys(q.combat.stats).length,4);
   assert(q.stats&&q.combat.matchId,'four authoritative players');
   const hostId=q.myId,before=q.stats[hostId].lastActionSeq;
   const startupWait=Math.max(250,Math.min(3500,q.combat.startAt-Date.now()+450));
   await delay(startupWait);
   const shotSentAt=Date.now();
   await shooter.page.locator('#arena').tap({position:{x:730,y:290},timeout:5000});
   const touchCompletedAt=Date.now();
   await shooter.page.waitForFunction(({k,id,seq})=>window[k]?.()?.stats?.[id]?.lastActionSeq>seq,{k:spec.qa,id:hostId,seq:before},{timeout:10000});
   const hostAckMs=Date.now()-shotSentAt;
   await observer.page.waitForFunction(({k,id,seq})=>window[k]?.()?.stats?.[id]?.lastActionSeq>seq,{k:spec.qa,id:hostId,seq:before},{timeout:10000});
   const peerAckMs=Date.now()-shotSentAt;
   const ackState=await snap(shooter,spec);
   const touch=ackState.inputTiming?.lastTouchShot;
   assert(touch?.submitted&&ackState.inputTiming.touchShots>=1,
    'real WebKit pointerup must issue an actual touch shot');
   assert(touch.handlerMs>=0&&touch.gestureMs>=0,
    'browser captures handler cost and touch hold duration separately');
   const ackReceipt=Object.values(ackState.combat?.usedActions||{}).find(v=>
    v.owner===hostId&&v.seq>before&&v.type==='shot'&&v.status==='accepted');
   console.log('PASS squad 4 participants: touch shot authoritative ack '+hostAckMs+
    'ms, other-client ack '+peerAckMs+
    'ms (local RTDB emulator, not real network RTT); host clock lag '+
    Math.round(ackState.hostClockLag||0)+'ms, input gesture awaited '+
    (touchCompletedAt-shotSentAt)+'ms; action timestamp to host acceptance '+
    (ackReceipt?Math.round(ackReceipt.acceptedAt-ackReceipt.at)+'ms':'receipt expired'));
   console.log('INPUT squad real Safari/WebKit pointer event: '+
    JSON.stringify({...touch,hostAcceptedFromActionMs:ackReceipt?
     Math.round(ackReceipt.acceptedAt-ackReceipt.at):null,
     webdriverTapMs:touchCompletedAt-shotSentAt,
     drawTiming:ackState.drawTiming}));
   // Verify four real clients can submit near-concurrent shots; all receipts must
   // survive the host's bounded batch transaction and appear on every client.
   await delay(450);
   const initial=await Promise.all(clients.map(c=>snap(c,spec)));
   const shots=initial.map(q=>({id:q.myId,seq:q.stats[q.myId].lastActionSeq}));
   await Promise.all(clients.map(c=>c.page.locator('#arena').tap({position:{x:730,y:290},timeout:5000})));
   await shooter.page.waitForFunction(({key,expected})=>{const q=window[key]?.();return !!q?.stats&&expected.every(p=>q.stats[p.id]?.lastActionSeq>p.seq);},{key:spec.qa,expected:shots},{timeout:16000});
   await observer.page.waitForFunction(({key,expected})=>{const q=window[key]?.();return !!q?.stats&&expected.every(p=>q.stats[p.id]?.lastActionSeq>p.seq);},{key:spec.qa,expected:shots},{timeout:16000});
   console.log('PASS squad 4 near-concurrent real-client shots: all four player action sequences accepted and replicated');

   // Four live users send position packets even when stationary. Regression:
   // frequent network positions must not re-run the complete scene layout or
   // force HUD work; the fixed 100ms refresh and game snapshots still do it.
   const beforePerf=await snap(shooter,spec),perfBefore=beforePerf.presentationMetrics,drawBefore=beforePerf.drawTiming,workBefore=beforePerf.workTiming;
   const phaseBefore=beforePerf.timerPhaseTiming,pauseBefore=beforePerf.pauseBannerMetrics,txnBefore=beforePerf.tickTxnTiming,quietBefore=beforePerf.quietTickMetrics;
   const arenaBefore=beforePerf.arenaBackdropMetrics;
   assert(perfBefore,'presentation diagnostics exposed in development HTML');
   assert(arenaBefore&&!arenaBefore.disabled&&arenaBefore.builds>=1,
    'static arena canvas paints once in real WebKit');
   await delay(1400);
   const afterPerf=await snap(shooter,spec),perfAfter=afterPerf.presentationMetrics,drawAfter=afterPerf.drawTiming,workAfter=afterPerf.workTiming;
   const phaseAfter=afterPerf.timerPhaseTiming,pauseAfter=afterPerf.pauseBannerMetrics,txnAfter=afterPerf.tickTxnTiming,quietAfter=afterPerf.quietTickMetrics;
   const arenaAfter=afterPerf.arenaBackdropMetrics;
   assert.equal(arenaAfter.builds,arenaBefore.builds,
    'no background re-rasterization across steady gameplay frames');
   assert(arenaAfter.frames>arenaBefore.frames,
    'real WebKit continues to blit cached arena while playing');
   console.log('PASS squad cached arena: '+arenaAfter.builds+' background builds; '+
    (arenaAfter.frames-arenaBefore.frames)+' blits during 1.4s (local WebKit)');
   const received=perfAfter.positionSnapshots-perfBefore.positionSnapshots;
   const hudUpdates=perfAfter.hudRenders-perfBefore.hudRenders;
   const sceneUpdates=perfAfter.gameSceneCalls-perfBefore.gameSceneCalls;
   assert(received>=4,'four active peers still send idle heartbeats: '+received);
   assert(received<=26,'stationary 4-player position stream should be throttled: '+received);
   assert.equal(sceneUpdates,0,'position updates must not rebuild the game scene');
   assert(hudUpdates<=40,'position flood should not trigger HUD on every packet: '+hudUpdates);
   assert(perfAfter.skippedPeriodicHud>perfBefore.skippedPeriodicHud,
    '100ms periodic HUD callback skips duplicate game snapshot DOM paints');
   assert(phaseAfter.hostCombat.calls>phaseBefore.hostCombat.calls,
    'authoritative host processing must run in unchanged 100ms cycle');
   assert(phaseAfter.actions.calls>phaseBefore.actions.calls,
    'confirmed action queue still checked in every timer cycle');
   assert(pauseAfter.skips>pauseBefore.skips,
    'unchanged pause banner should not mutate DOM on every timer pulse');
   console.log('PASS squad stationary stream: '+received+' position snapshots; '+
    hudUpdates+' HUD redraws; '+sceneUpdates+' redundant game-scene rebuilds in 1400ms (local WebKit)');
   const nDraws=drawAfter.frames-drawBefore.frames;
   console.log('PERF squad host actual JS Canvas draw cost (WebKit CI, not iPad): '+
    JSON.stringify({frames:nDraws,avgDrawMs:nDraws>0?
     Math.round((drawAfter.totalDrawMs-drawBefore.totalDrawMs)/nDraws*10)/10:null,
     maxSinceStartMs:Math.round(drawAfter.maxDrawMs*10)/10,
     skippedCovered:drawAfter.skippedCoveredFrames}));
   const delta=(key)=>workAfter[key]-workBefore[key];
   console.log('TRACE squad JS vs rAF scheduling (local WebKit only): '+
    JSON.stringify({foregroundFrames:delta('frameSamples'),
     gapsOver100ms:delta('frameGapOver100'),
     maxGapMs:Math.round(workAfter.frameGapMaxMs),
     jsNonDrawAvgMs:delta('frameSamples')?
      Math.round(delta('nonDrawTotalMs')/delta('frameSamples')*10)/10:null,
     jsBotAvgMs:delta('frameSamples')?
      Math.round(delta('botTotalMs')/delta('frameSamples')*10)/10:null,
     snapshotUpdates:delta('gameSnapshots'),
     snapshotCallbackAvgMs:delta('gameSnapshots')?
      Math.round(delta('gameSnapshotTotalMs')/delta('gameSnapshots')*10)/10:null,
     hostTimerPulses:delta('timerPulses'),
     hostTimerAvgMs:delta('timerPulses')?
      Math.round(delta('timerTotalMs')/delta('timerPulses')*10)/10:null,
     skippedRedundantHud:perfAfter.skippedPeriodicHud-perfBefore.skippedPeriodicHud,
     fallbackHud:perfAfter.periodicHudRenders-perfBefore.periodicHudRenders}));
   const phases=Object.fromEntries(Object.entries(phaseAfter).map(([name,p])=>{
    const before=phaseBefore[name],calls=p.calls-before.calls;
    return [name,{calls,avgSyncMs:calls?
     Math.round((p.totalMs-before.totalMs)/calls*10)/10:0,
     maxSinceStartMs:Math.round(p.maxMs*10)/10}];
   }));
   console.log('TRACE squad 100ms timer synchronous phase CPU (local WebKit): '+
    JSON.stringify({phases,pauseBannerWrites:pauseAfter.writes-pauseBefore.writes,
     pauseBannerSkips:pauseAfter.skips-pauseBefore.skips,
     totalTimerSyncMs:Math.round(delta('timerTotalMs')*10)/10}));
   assert(quietAfter&&quietBefore&&Number.isSafeInteger(quietAfter.deferrals),
    'real WebKit exposes local quiet-KO write avoidance diagnostics');
   console.log('TRACE squad quiet KO double-step writes (local WebKit): '+
    JSON.stringify({mode:afterPerf.mode,phase:afterPerf.game,
     deferredPolls:quietAfter.deferrals-quietBefore.deferrals,
     twoStepsOneWrite:quietAfter.doubleSteps-quietBefore.doubleSteps,
     activeOneStep:quietAfter.ordinarySteps-quietBefore.ordinarySteps,
     staleFirebaseFallback:quietAfter.unsafeAtCommit-quietBefore.unsafeAtCommit}));
   const diff=key=>txnAfter[key]-txnBefore[key];
   const avg=(key,denom)=>denom?Math.round(diff(key)/denom*10)/10:null;
   console.log('TRACE squad host Firebase transaction CPU vs network wait (local WebKit): '+
    JSON.stringify({transactions:diff('starts'),committed:diff('committed'),
     rejected:diff('rejected'),updaterCalls:diff('updaterCalls'),
     sdkTransactionCallAvgMs:avg('callMs',diff('starts')),
     sdkTransactionCallMaxMs:Math.round(txnAfter.callMaxMs*10)/10,
     authoritativeUpdaterAvgMs:avg('updaterMs',diff('updaterCalls')),
     sharedEngineAvgMs:avg('engineMs',diff('engineCalls')),
     immutablePositionSnapshotAvgMs:avg('snapshotMs',diff('starts')),
     firebasePromiseElapsedAvgMs:avg('elapsedMs',diff('starts'))}));

   // The idle optimization must NOT introduce lag in movement or in stop
   // packets. Prove browser keyboard motion travels through live RTDB.
   const movingClient=clients[1],moverId=(await snap(movingClient,spec)).myId;
   const moverStart=(await snap(shooter,spec)).positionValues[moverId]?.x;
   assert(Number.isFinite(moverStart),'peer position exists before move');
   await movingClient.page.keyboard.down('d');
   await delay(620);
   await movingClient.page.keyboard.up('d');
   await shooter.page.waitForFunction(({k,id,start})=>
    (window[k]?.()?.positionValues?.[id]?.x||0)>start+5,
    {k:spec.qa,id:moverId,start:moverStart},{timeout:9000});
   const moverAfter=(await snap(shooter,spec)).positionValues[moverId].x;
   await shooter.page.waitForFunction(({k,id})=>
    Math.abs(window[k]?.()?.positionValues?.[id]?.vx??1)<5,
    {k:spec.qa,id:moverId},{timeout:9000});
   console.log('PASS squad moving peer: real keyboard x '+moverStart+' -> '+moverAfter+
    ', stop velocity replicated with active position cadence');
   const adaptive=await snap(shooter,spec);
   console.log('PERF squad adaptive DPR2 host after live combat: '+JSON.stringify({
    css:adaptive.canvasMetrics.cssWidth+'x'+adaptive.canvasMetrics.cssHeight,
    backing:adaptive.canvasMetrics.backingWidth+'x'+adaptive.canvasMetrics.backingHeight,
    cap:adaptive.canvasMetrics.dynamicCap,
    reductions:adaptive.canvasMetrics.qualityReductions,
    resizes:adaptive.canvasMetrics.canvasResizes
   }));
   assert(adaptive.canvasMetrics.dynamicCap>=1&&adaptive.canvasMetrics.dynamicCap<=2,
    'render quality stays within CSS-to-retina limits');

   // Record, but do not over-interpret, per-browser animation-frame pacing.
   // CI hardware is not a school iPad, so this is diagnostic rather than
   // a universal FPS gate.
   const cadence=await Promise.all(clients.map(c=>c.page.evaluate(()=>new Promise(resolve=>{
    const intervals=[];let first=0,last=0;
    function sample(now){if(!first)first=now;if(last)intervals.push(now-last);last=now;
     if(now-first<900)requestAnimationFrame(sample);
     else{intervals.sort((a,b)=>a-b);resolve({
      frames:intervals.length,
      medianMs:intervals[Math.floor(intervals.length*.5)]||0,
      p95Ms:intervals[Math.floor(intervals.length*.95)]||0
     });}
    }
    requestAnimationFrame(sample);
   }))));
   console.log('PERF squad 4 browsers WebKit frame pacing (NOT iPad hardware): '+JSON.stringify(cadence));


   // Real browser gameplay + local Firebase emulator: warp one attacker and
   // defender into range, then fire through the UI and assert actual host HP.
   // This touches ONLY the local test RTDB, never the user's production room.
   const readyQs=await Promise.all(clients.map(c=>snap(c,spec)));
   const targetIndex=readyQs.findIndex((v,i)=>i>0&&v.seat?.startsWith('red'));
   assert(targetIndex>0,'opposing red-team human client available for damage test');
   const victimId=readyQs[targetIndex].myId,attackerId=readyQs[0].myId;
   const combat=readyQs[0].combat;
   assert.equal(combat.phase,'playing','battle must still be active for damage E2E');
   const moves={
    [attackerId]:{rev:combat.motions[attackerId].rev+1,x:700,y:540,a:0},
    [victimId]:{rev:combat.motions[victimId].rev+1,x:760,y:540,a:Math.PI}
   };
   await shooter.page.evaluate(async ({roomId,motions})=>{
    await window.firebase.database().ref('rooms2v2/'+roomId+'/game/motions').update(motions);
   },{roomId:id,motions:moves});
   await shooter.page.waitForFunction(({k})=>Math.abs((window[k]?.()?.local?.x||0)-700)<5,{k:spec.qa},{timeout:9000});
   await clients[targetIndex].page.waitForFunction(({k})=>Math.abs((window[k]?.()?.local?.x||0)-760)<5,{k:spec.qa},{timeout:9000});
   await shooter.page.waitForFunction(({k,victim})=>{
    const p=window[k]?.()?.positionValues?.[victim];
    return !!p&&Math.abs(p.x-760)<5;
   },{k:spec.qa,victim:victimId},{timeout:9000});
   const hpBefore=(await snap(shooter,spec)).hp[victimId];
   assert(hpBefore>0,'opposing human must be alive and damageable');
   const attackerBefore=(await snap(shooter,spec)).stats[attackerId].lastActionSeq;
   const beforeInfo=await snap(shooter,spec);
   console.log('HP DAMAGE SETUP '+JSON.stringify({mode:beforeInfo.mode,hostChar:beforeInfo.stats[attackerId]?.char,ammo:beforeInfo.stats[attackerId]?.ammo,victimId,hpBefore,hostPosition:beforeInfo.local,victimPosition:beforeInfo.positionValues[victimId],gameClock:beforeInfo.combat?.clock,hostSeat:beforeInfo.seat}));
   await shooter.page.locator('#arena').tap({position:{x:730,y:290},timeout:5000});
   await shooter.page.waitForFunction(({k,attacker,seq})=>(window[k]?.()?.stats?.[attacker]?.lastActionSeq??0)>seq,
    {k:spec.qa,attacker:attackerId,seq:attackerBefore},{timeout:10000});
   await delay(1000);
   const afterInfo=await snap(shooter,spec);
   console.log('HP DAMAGE SHOT '+JSON.stringify({hostAmmo:afterInfo.stats[attackerId]?.ammo,hostHP:afterInfo.hp[attackerId],victimHP:afterInfo.hp[victimId],hostPosition:afterInfo.local,victimPosition:afterInfo.positionValues[victimId],projectiles:afterInfo.combat?.projectiles,events:afterInfo.combat?.events,usedActions:afterInfo.combat?.usedActions,combatClock:afterInfo.combat?.clock}));
   try{
    await shooter.page.waitForFunction(({k,victim,hp})=>(window[k]?.()?.hp?.[victim]??Infinity)<hp,
      {k:spec.qa,victim:victimId,hp:hpBefore},{timeout:8000});
   }catch(err){
    for(const [ix,c] of clients.entries()){
     const q=await snap(c,spec);
     console.error('DAMAGE TIMEOUT '+ix+' '+JSON.stringify({
      hostAuthorized:q.hostAuthorized,combatReady:q.combatReadyNow,hostTimerActive:q.hostTimerActive,hostTimerPulses:q.hostTimerPulses,combatTickCalls:q.combatTickCalls,combatTickSkips:q.combatTickSkips,combatTickResults:q.combatTickResults,combatTickLastError:q.combatTickLastError,
      combatBusy:q.combatBusy,hostProcessing:q.hostProcessing,hostActionDispatchQueued:q.hostActionDispatchQueued,
      hostQueue:q.hostQueue,pendingActionCount:q.pendingActionCount,
      clockLag:q.hostClockLag,clock:q.combat?.clock,rev:q.combat?.combatRev,
      phase:q.game,token:q.gameHostToken,cid:q.connectionId,
      victimHP:q.hp?.[victimId],shots:q.shots,
      projectileIds:Object.keys(q.combat?.projectiles||{}),
      position:q.positionValues?.[victimId],stats:q.stats?.[attackerId]
     }));
    }
    throw err;
   }
   await clients[targetIndex].page.waitForFunction(({k,victim,hp})=>(window[k]?.()?.hp?.[victim]??Infinity)<hp,
    {k:spec.qa,victim:victimId,hp:hpBefore},{timeout:12000});
   const hpAfter=(await snap(clients[targetIndex],spec)).hp[victimId];
   console.log('PASS squad in-range human-shot E2E: authoritative enemy HP '+hpBefore+' -> '+hpAfter+' replicated in both separate browsers');

   // Real WebKit client loses RTDB: peer must pause, reconnect, and accept its next shot.
   const guest=clients[targetIndex],oldGuestCid=(await snap(guest,spec)).connectionId;
   await guest.page.evaluate(()=>window.firebase.database().goOffline());
   await shooter.page.waitForFunction(k=>{
    const q=window[k]?.();return q?.game==='paused'&&q.online===3;
   },spec.qa,{timeout:18000});
   await guest.page.evaluate(()=>window.firebase.database().goOnline());
   await guest.page.waitForFunction(({k,cid})=>{
    const q=window[k]?.();return q?.game==='playing'&&q.online===4&&q.combatReadyNow&&
     !!q.connectionId&&q.connectionId!==cid;
   },{k:spec.qa,cid:oldGuestCid},{timeout:24000});
   const guestSeq=(await snap(guest,spec)).stats[victimId].lastActionSeq;
   await guest.page.locator('#arena').tap({position:{x:730,y:290},timeout:5000});
   await shooter.page.waitForFunction(({k,id,seq})=>window[k]?.()?.stats?.[id]?.lastActionSeq>seq,
    {k:spec.qa,id:victimId,seq:guestSeq},{timeout:14000});
   console.log('PASS squad guest RTDB reconnect: paused, all four resumed, next shot accepted');

   // Owner reconnect also has to reclaim the stale host token or combat freezes.
   const oldHostCid=(await snap(shooter,spec)).connectionId;
   await shooter.page.evaluate(()=>window.firebase.database().goOffline());
   await observer.page.waitForFunction(k=>{
    const q=window[k]?.();return q?.game==='paused'&&q.online===3;
   },spec.qa,{timeout:18000});
   await shooter.page.evaluate(()=>window.firebase.database().goOnline());
   await shooter.page.waitForFunction(({k,cid})=>{
    const q=window[k]?.();return q?.game==='playing'&&q.online===4&&q.combatReadyNow&&
     !!q.connectionId&&q.connectionId!==cid&&q.gameHostToken===q.connectionId&&q.hostAuthorized;
   },{k:spec.qa,cid:oldHostCid},{timeout:24000});
   const hostSeq=(await snap(shooter,spec)).stats[attackerId].lastActionSeq;
   await shooter.page.locator('#arena').tap({position:{x:730,y:290},timeout:5000});
   await observer.page.waitForFunction(({k,id,seq})=>window[k]?.()?.stats?.[id]?.lastActionSeq>seq,
    {k:spec.qa,id:attackerId,seq:hostSeq},{timeout:14000});
   console.log('PASS squad owner RTDB reconnect: host token recovered, next shot replicated');

   // Test actual live skill controls through the host-authoritative Firebase
   // queue. Both input and effects must replicate, not just local HUD feedback.
   await shooter.page.waitForFunction(k=>window[k]?.()?.combatReadyNow,spec.qa,{timeout:12000});
   const gadBefore=(await snap(shooter,spec)).stats[attackerId].gadgets;
   const gadMotionBefore=(await snap(shooter,spec)).combat.motions[attackerId].rev;
   assert(gadBefore>0,'tank must have a gadget for online skill E2E');
   await shooter.page.keyboard.press('q');
   await observer.page.waitForFunction(({k,id,amount,rev})=>{
    const q=window[k]?.();return q?.stats?.[id]?.gadgets===amount-1&&
     q?.combat?.motions?.[id]?.rev>rev;
   },{k:spec.qa,id:attackerId,amount:gadBefore,rev:gadMotionBefore},{timeout:13000});
   console.log('PASS squad real online tank GAD: resource spent and authoritative dash replicated');

   // The ULT meter is charged in a LOCAL EMULATOR fixture only. Use the
   // game's real keyboard control and require the peer to see the ability.
   await shooter.page.evaluate(async ({roomId,id})=>{
    const ref=window.firebase.database().ref('rooms2v2/'+roomId+'/game');
    const result=await ref.transaction(g=>{
     if(!g||g.phase!=='playing'||!g.stats?.[id])return;
     g.stats[id].ult=100;return g;
    },undefined,false);
    if(!result.committed)throw Error('failed to charge local emulator ULT fixture');
   },{roomId:id,id:attackerId});
   await shooter.page.waitForFunction(({k,id})=>window[k]?.()?.stats?.[id]?.ult===100,
    {k:spec.qa,id:attackerId},{timeout:12000});
   await delay(350); // Independent local gadget/ULT input cooldown.
   const ultSeq=(await snap(shooter,spec)).stats[attackerId].lastActionSeq;
   await shooter.page.keyboard.press('e');
   await observer.page.waitForFunction(({k,id,seq})=>{
    const q=window[k]?.();return q?.stats?.[id]?.lastActionSeq>seq&&
     q.stats[id].ult===0;
   },{k:spec.qa,id:attackerId,seq:ultSeq},{timeout:15000});
   console.log('PASS squad real online tank ULT: charged meter spent and accepted by peer');

   // An accepted Tank ULT is airborne for 0.6–1.2s. It is deliberately
   // impossible to shoot while airborne, so wait for actual landing.
   await shooter.page.waitForFunction(({k,id})=>{
    const q=window[k]?.();return q?.combatReadyNow&&
     !Object.values(q.combat?.scheduled||{}).some(u=>u.kind==='jump'&&u.owner===id);
   },{k:spec.qa,id:attackerId},{timeout:12000});

   // In addition to desktop Q/E, verify the on-screen touch buttons on a
   // second real WebKit client. This is the iPad/phone input path.
   await guest.page.waitForFunction(k=>window[k]?.()?.combatReadyNow,spec.qa,{timeout:10000});
   const touchBefore=await snap(guest,spec);
   assert.equal(touchBefore.stats[victimId].char,'tank','touch ability test expects a tank');
   assert(touchBefore.stats[victimId].gadgets>0,'touch client has available GAD');
   await guest.page.locator('#gadAction').tap({timeout:5000});
   await shooter.page.waitForFunction(({k,id,before,rev})=>{
    const q=window[k]?.();return q?.stats?.[id]?.gadgets===before-1&&
     q?.combat?.motions?.[id]?.rev>rev;
   },{k:spec.qa,id:victimId,before:touchBefore.stats[victimId].gadgets,
      rev:touchBefore.combat.motions[victimId].rev},{timeout:13000});
   console.log('PASS squad real touch GAD: peer confirms resource and movement on 2nd device');

   // ULT is charged ONLY via a test emulator transaction; trigger it from
   // actual WebKit pointerdown/pointerup on the touch control.
   await guest.page.evaluate(async ({roomId,id})=>{
    const ref=window.firebase.database().ref('rooms2v2/'+roomId+'/game');
    const result=await ref.transaction(g=>{
     if(!g||g.phase!=='playing'||!g.stats?.[id])return;
     g.stats[id].ult=100;return g;
    },undefined,false);
    if(!result.committed)throw Error('touch ULT local emulator fixture failed');
   },{roomId:id,id:victimId});
   await guest.page.waitForFunction(({k,id})=>window[k]?.()?.stats?.[id]?.ult===100,
    {k:spec.qa,id:victimId},{timeout:12000});
   await delay(350);
   const touchUltSeq=(await snap(guest,spec)).stats[victimId].lastActionSeq;
   await guest.page.locator('#ultAction').tap({timeout:5000});
   await shooter.page.waitForFunction(({k,id,seq})=>{
    const q=window[k]?.();return q?.stats?.[id]?.lastActionSeq>seq&&
     q.stats[id].ult===0;
   },{k:spec.qa,id:victimId,seq:touchUltSeq},{timeout:15000});
   await guest.page.waitForFunction(({k,id})=>{
    const q=window[k]?.();return q?.combatReadyNow&&
     !Object.values(q.combat?.scheduled||{}).some(u=>u.kind==='jump'&&u.owner===id);
   },{k:spec.qa,id:victimId},{timeout:12000});
   console.log('PASS squad real touch ULT: peer sees accepted ultimate, tank landing complete');

   // Force a nearly finished knockout on the LOCAL EMULATOR, then deliver the
   // decisive shot via the actual touch control. Check scores and KO across
   // all four browsers, without relying on the short-lived round_end screen.
   await shooter.page.waitForFunction(k=>window[k]?.()?.combatReadyNow,spec.qa,{timeout:12000});
   const koState=await snap(shooter,spec);
   const otherRedId=readyQs.find(v=>v.seat?.startsWith('red')&&v.myId!==victimId)?.myId;
   assert(otherRedId,'second enemy is available for 2vs2 knockout');
   const koMoves={
    [attackerId]:{rev:koState.combat.motions[attackerId].rev+1,x:700,y:540,a:0},
    [victimId]:{rev:koState.combat.motions[victimId].rev+1,x:760,y:540,a:Math.PI}
   };
   await shooter.page.evaluate(async ({roomId,motions,near,other})=>{
    const ref=window.firebase.database().ref('rooms2v2/'+roomId+'/game');
    const result=await ref.transaction(g=>{
     if(!g||g.phase!=='playing')return;
     Object.assign(g.motions,motions);
     g.hp[near]=1;
     g.hp[other]=0;
     return g;
    },undefined,false);
    if(!result.committed)throw Error('failed to stage local emulator KO fixture');
   },{roomId:id,motions:koMoves,near:victimId,other:otherRedId});
   await shooter.page.waitForFunction(({k,target})=>{
    const q=window[k]?.();return q?.combatReadyNow&&Math.abs(q.local?.x-700)<5&&
     Math.abs(q.positionValues?.[target]?.x-760)<5&&q.hp?.[target]===1;
   },{k:spec.qa,target:victimId},{timeout:14000});
   const scoreBefore=koState.scores?.blue||0;
   const koSeq=(await snap(shooter,spec)).stats[attackerId].lastActionSeq;
   await shooter.page.locator('#arena').tap({position:{x:730,y:290},timeout:5000});
   try{
    await shooter.page.waitForFunction(({k,id,seq})=>
     (window[k]?.()?.stats?.[id]?.lastActionSeq??0)>seq,
     {k:spec.qa,id:attackerId,seq:koSeq},{timeout:13000});
    await Promise.all(clients.map(c=>c.page.waitForFunction(({k,score})=>{
     const q=window[k]?.();return q?.scores?.blue===score+1&&
      q?.combat?.battleStats&&Object.values(q.combat.battleStats).some(v=>v.kos>0);
    },{k:spec.qa,score:scoreBefore},{timeout:15000})));
   }catch(err){
    for(const [ix,c]of clients.entries()){
     const q=await snap(c,spec);
     console.error('KO DIAGNOSTIC '+ix+' '+JSON.stringify({
      phase:q.game,round:q.round,score:q.scores,online:q.online,
      actor:q.myId,host:q.gameHostToken,authorized:q.hostAuthorized,
      combatReady:q.combatReadyNow,queue:q.hostQueue,scheduled:q.combat?.scheduled,
      actionSeq:q.stats?.[attackerId]?.lastActionSeq,receipts:q.combat?.usedActions,
      hp:q.hp,positions:q.positionValues,local:q.local,motions:q.combat?.motions,
      lastError:q.combatTickLastError
     }));
    }
    throw err;
   }
   const koAfter=await snap(observer,spec);
   assert(['round_end','playing','match_end'].includes(koAfter.game),'resolved or advanced KO phase');
   assert.equal(koAfter.combat.battleStats[attackerId].kos>=1,true,'host credited with decisive KO');
   console.log('PASS squad real online KO: last enemy eliminated, blue score increments and all 4 clients agree');



  }
  for(const c of clients)assert.deepEqual(c.issues.filter(x=>x.startsWith('JS ')),[],'browser runtime '+c.who);
 }catch(error){
  for(const c of clients){
   const q=await snap(c,spec).catch(()=>null);
   const uiStatus=await c.page.locator(spec.mode==='squad'?'#homeStatus':'#lobbyStatus').innerText().catch(()=>'?');
   console.error('STATE '+spec.mode+' '+c.who+' '+JSON.stringify({scene:q?.scene,roomId:q?.roomId,game:q?.game?.phase||q?.game,lobby:q?.lobby?.status,connected:q?.connected,online:q?.online,uiStatus,issues:c.issues.slice(-8)}));
  }
  throw error;
 }finally{for(const c of clients)await c.ctx.close();}
}
(async()=>{
 for(const file of ['firebase-app-compat.js','firebase-database-compat.js'])assert(fs.existsSync(path.join(sdk,file)),'SDK absent: '+file);
 await new Promise(resolve=>server.listen(ports,'127.0.0.1',resolve));
 const browser=await webkit.launch({headless:true});
 try{
  await run(browser,specs[0],2,-1); // two separate humans
  await run(browser,specs[0],2,1);  // player on PC + phone as dedicated BOT
  await run(browser,specs[1],4,-1); // four distinct friends
  console.log('PASS REAL WebKit multi-client RTDB-emulator E2E. LOCAL ONLY, not Internet or school iPad RTT.');
 }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(error=>{console.error(error?.stack||error);server.close();process.exitCode=1;});
