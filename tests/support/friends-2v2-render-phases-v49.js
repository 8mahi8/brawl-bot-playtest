// BRAWL V4.9 — test-only, per-device rAF/Canvas shot phase sampler.
// Installed only in the LOCAL Firebase emulator WebKit fixture.
// Never persists identifiers, touches Firebase, or invents a network RTT.
(function(){
 'use strict';
 const MAX_TRACKS=128,LIMIT=256,TTL_MS=3000;
 const KEYS=['receiveToNextFrameMs','nextFrameToFirstDrawMs',
  'receiveToFirstCanvasDrawMs','receiveToFirstVisualMs','nextFrameToFirstVisualMs'];
 let active=false,tracks=new Map(),samples={},counts={},lastFrame=null;
 function reset(){
  tracks.clear();samples=Object.fromEntries(KEYS.map(k=>[k,[]]));
  counts={remoteActions:0,firstFrames:0,firstCanvasDraws:0,firstVisuals:0,
   visualEarly:0,visualAuthoritative:0,unpaintedActions:0,
   skippedDrawDecisionsWhilePending:0,canvasDrawDecisionsWhilePending:0};
  lastFrame=null;
 }
 function push(key,delta){
  if(!Number.isFinite(delta)||delta<0||delta>TTL_MS)return;
  const arr=samples[key];arr.push(Math.round(delta*10)/10);
  if(arr.length>LIMIT)arr.shift();
 }
 function cleanup(now){
  for(const [id,t]of tracks)if(now-t.at>TTL_MS)tracks.delete(id);
  while(tracks.size>MAX_TRACKS)tracks.delete(tracks.keys().next().value);
 }
 function start(){reset();active=true;return {running:true,localOnly:true};}
 function receive(a){
  if(!active||a?.type!=='shot'||typeof a.eventId!=='string'||!a.eventId)return;
  const now=performance.now();
  cleanup(now);
  if(tracks.has(a.eventId))return;
  tracks.set(a.eventId,{at:now,frame:null,draw:null,visual:null});
  counts.remoteActions++;
  cleanup(now);
 }
 function frame(now=performance.now()){
  if(!active)return;
  if(!Number.isFinite(now))now=performance.now();
  lastFrame=now;
  cleanup(now);
  for(const t of tracks.values())if(t.frame===null&&now>=t.at){
   t.frame=now;counts.firstFrames++;push('receiveToNextFrameMs',now-t.at);
  }
 }
 function drawDecision(didDraw,now=performance.now()){
  if(!active)return didDraw;
  if(!Number.isFinite(now))now=performance.now();
  let pending=false;
  for(const t of tracks.values())if(t.visual===null){
   pending=true;
   if(didDraw&&t.draw===null&&now>=t.at){
    t.draw=now;counts.firstCanvasDraws++;
    push('receiveToFirstCanvasDrawMs',now-t.at);
    if(t.frame!==null)push('nextFrameToFirstDrawMs',now-t.frame);
   }
  }
  if(pending){
   if(didDraw)counts.canvasDrawDecisionsWhilePending++;
   else counts.skippedDrawDecisionsWhilePending++;
  }
  return didDraw;
 }
 function visual(id,type){
  if(!active||typeof id!=='string')return;
  const t=tracks.get(id),now=performance.now();
  if(!t||t.visual!==null||now<t.at)return;
  t.visual=now;counts.firstVisuals++;
  if(type==='early')counts.visualEarly++;
  else counts.visualAuthoritative++;
  push('receiveToFirstVisualMs',now-t.at);
  if(t.frame!==null)push('nextFrameToFirstVisualMs',now-t.frame);
  tracks.delete(id);
 }
 function stage(key){
  const arr=samples[key].slice().sort((a,b)=>a-b);
  const at=f=>arr[Math.max(0,Math.ceil(arr.length*f)-1)]??null;
  return {samples:arr.length,p50Ms:at(.5),p95Ms:at(.95),maxMs:at(1)};
 }
 function report(){
  const unpaintedActions=Math.max(0,counts.remoteActions-counts.firstVisuals);
  return {version:'V4.9',localOnly:true,
   events:{...counts,unpaintedActions},
   stages:Object.fromEntries(KEYS.map(k=>[k,stage(k)])),
   caveats:['performance.now stages are local to each browser only',
    'rAF callback and Canvas draw-command time are not physical screen presentation',
    'Firebase emulator on the shared CI machine is not school Wi-Fi',
    'visual metrics only sample shot ACTIONs with an observed qualifying draw',
    'firstCanvasDraw is the next eligible Canvas frame, not proof that the projectile was visible',
    'per-shot and room identifiers are never returned']};
 }
 function stop(){active=false;const out=report();tracks.clear();return out;}
 reset();
 window.__v49ShotFrames=Object.freeze({start,stop,report,receive,frame,drawDecision,visual,
  status:()=>({running:active,pending:tracks.size})});
})();
