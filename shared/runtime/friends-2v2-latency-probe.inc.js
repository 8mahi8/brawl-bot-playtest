// BRAWL V3.5 – LOCAL, opt-in 2v2 performance sampler.
// This file is injected only into generated staging HTML. Never writes RTDB,
// changes combat logic, stores player identifiers, or starts timers by itself.
(function(){
 'use strict';
 const MAX_POINTS=480,DEFAULT_INTERVAL_MS=250;
 let points=[],scope=null,running=false,timer=null;
 const valid=n=>typeof n==='number'&&Number.isFinite(n);
 const round=n=>valid(n)?Math.round(n*10)/10:null;
 const delta=(a,b,k)=>valid(a?.[k])&&valid(b?.[k])&&b[k]>=a[k]?b[k]-a[k]:0;
 // Read existing lightweight counters. No structuredClone(game), no SDK calls.
 function read(){
  const p=presentationMetrics,w=workTiming,d=drawTiming,e=earlyShotStats,i=inputTiming;
  return {
   t:performance.now(),scope:game?.matchId+'|'+game?.round,phase:game?.phase,
   connected:!!connected,
   remoteShotActions:e.incoming,earlyDrawOperations:e.shown,
   bomberActions:e.bomber,hostVisualHandoffs:e.hostHandoffs,
   gameSnapshots:w.gameSnapshots,positionSnapshots:w.positionSnapshots,
   positionWrites:p.positionWrites,positionIdleSkips:p.positionIdleSkips,
   frames:w.frameSamples,framesOver100ms:w.frameGapOver100,
   canvasFrames:d.frames,canvasTotalMs:d.totalDrawMs,
   nonDrawTotalMs:w.nonDrawTotalMs,
   hudRenders:p.hudRenders,timerPulses:w.timerPulses,
   touchShots:i.touchShots,
   latestInputQueueMs:i.lastTouchShot?.upQueueMs??null,
   latestHandlerMs:i.lastTouchShot?.handlerMs??null,
   latestTouchToCanvasSubmitMs:i.lastTouchShot?.canvasDrawSubmittedMs??null,
   lastSnapshotGapMs:snapshotGap,
   sessionFrameGapMaxMs:w.frameGapMaxMs,
   sessionCanvasDrawMaxMs:d.maxDrawMs
  };
 }
 function capture(){
  if(!running)return {captured:false,reason:'inactive'};
  const p=read();
  if(p.phase!=='playing'||!p.connected)return {captured:false,reason:'not-playing'};
  if(scope!==p.scope){points=[];scope=p.scope;}
  // Do not accumulate duplicate timestamps from user and timer racing.
  if(points.length&&p.t<=points[points.length-1].t)return {captured:false,reason:'duplicate'};
  points.push(p);if(points.length>MAX_POINTS)points.shift();
  return {captured:true,samples:points.length};
 }
 function stopTimer(){if(timer!==null){clearInterval(timer);timer=null;}}
 function start(intervalMs=DEFAULT_INTERVAL_MS){
  if(!Number.isInteger(intervalMs)||intervalMs<100||intervalMs>1000)
   throw Error('V3.5 sampling interval must be 100–1000ms');
  stopTimer();points=[];scope=null;running=true;
  capture();timer=setInterval(capture,intervalMs);
  return {running:true,intervalMs,samples:points.length,localOnly:true};
 }
 function report(){
  const first=points[0],last=points[points.length-1];
  if(!first||!last)return {version:'V3.5',samples:points.length,running,ready:false,
   note:'Start the local sampler during a connected 2vs2 match; no RTDB round-trip time measured.'};
  const sec=Math.max(0,(last.t-first.t)/1000);
  const perSec=k=>sec>0?round(delta(first,last,k)/sec):null;
  const frames=delta(first,last,'frames'),draws=delta(first,last,'canvasFrames');
  const n=key=>delta(first,last,key);
  return {
   version:'V3.5',ready:points.length>=2&&sec>=0.5,
   running,samples:points.length,windowSeconds:round(sec),
   connectionObserved:last.connected,gamePhase:last.phase,
   // ACTION arrived vs visual operations/handoff. These are COUNTS, not ms.
   projectile:{receivedActionCount:n('remoteShotActions'),previewDrawOperations:n('earlyDrawOperations'),
    bomberActionCount:n('bomberActions'),hostVisualHandoffCount:n('hostVisualHandoffs')},
   // Game and position snapshots are subscription callback counts, NOT ping.
   traffic:{gameSnapshotCallbacks:n('gameSnapshots'),gameSnapshotsPerSecond:perSec('gameSnapshots'),
    positionSnapshotCallbacks:n('positionSnapshots'),positionCallbacksPerSecond:perSec('positionSnapshots'),
    localPositionWrites:n('positionWrites'),idlePositionSkips:n('positionIdleSkips'),
    lastObservedGameSnapshotGapMs:round(last.lastSnapshotGapMs)},
   presentation:{renderedFrames:frames,framesPerSecond:perSec('frames'),
    frameGapsOver100ms:n('framesOver100ms'),
    frameGapOver100msPercent:frames?round(100*n('framesOver100ms')/frames):null,
    canvasFrameCount:draws,
    averageCanvasDrawMs:draws?round(n('canvasTotalMs')/draws):null,
    averageNonDrawWorkMs:frames?round(n('nonDrawTotalMs')/frames):null,
    sessionMaxFrameGapMs:round(last.sessionFrameGapMaxMs),
    sessionMaxCanvasDrawMs:round(last.sessionCanvasDrawMaxMs),
    hudRenderCount:n('hudRenders')},
   input:{touchShotCount:n('touchShots'),latestPointerUpQueueMs:round(last.latestInputQueueMs),
    latestHandlerDurationMs:round(last.latestHandlerMs),
    latestHandlerToCanvasSubmissionMs:round(last.latestTouchToCanvasSubmitMs)},
   limitations:[
    'Counters are local and reset when a match/round changes; no player IDs or raw events are exported.',
    'Snapshot callback rate is not RTDB latency or network RTT.',
    'Preview draw operations may count the same projectile on multiple frames.',
    'Handler-to-Canvas submission is not physical screen presentation latency.',
    'Max frame/draw values are since game session start, not only this sampling window.'
   ]
  };
 }
 function stop(){capture();running=false;stopTimer();return report();}
 function reset(){running=false;stopTimer();points=[];scope=null;return {running:false,samples:0};}
 window.__brawlLatencyV35QA=Object.freeze({
  start,capture,stop,reset,report,status:()=>({running,samples:points.length,maxSamples:MAX_POINTS})
 });
})();
