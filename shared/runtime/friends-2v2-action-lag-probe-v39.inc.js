// BRAWL V3.9: opt-in shot pipeline measurements, STAGING 2v2 only.
// Uses performance.now() only for SAME-DEVICE durations. Estimated action age
// from serverNow()-action.at is NOT RTT and may have clock-offset error.
// No network calls, storage, player identifiers in reports or automatic timers.
(function(){
 'use strict';
 const LIMIT=256,MAX_PENDING=128,AGE_LIMIT_MS=12000;
 const METRICS=['writeAckMs','remoteActionEstimatedAgeMs','receiveToFirstVisualMs',
  'receiveToReceiptMs','hostTransactionMs','sendToReceiptMs'];
 let active=false,scope='',startedAt=0,tracks=new Map(),values={},counts={};
 const number=x=>typeof x==='number'&&Number.isFinite(x);
 const fresh=()=>{
  tracks.clear();
  values=Object.fromEntries(METRICS.map(k=>[k,[]]));
  counts={localShots:0,writeAck:0,remoteShots:0,firstVisuals:0,
   visualBeforeAction:0,authoritativeReceipts:0,hostTransactions:0,
   hostCommitted:0,hostAborted:0,failedWrites:0};
 };
 fresh();
 function currentScope(){
  return game?.matchId&&Number.isInteger(game?.round)?game.matchId+'|'+game.round:null;
 }
 function checkScope(){
  if(!active||!game||game.phase!=='playing')return false;
  const key=currentScope();
  if(!key)return false;
  if(scope!==key){scope=key;fresh();startedAt=performance.now();}
  return true;
 }
 function add(key,ms,lo=0,hi=12000){
  if(!values[key]||!number(ms)||ms<lo||ms>hi)return;
  const a=values[key];a.push(Math.round(ms*10)/10);
  if(a.length>LIMIT)a.shift();
 }
 function track(id){
  if(typeof id!=='string'||!id)return null;
  let entry=tracks.get(id);
  if(!entry){entry={updatedAt:performance.now()};tracks.set(id,entry);}
  entry.updatedAt=performance.now();
  if(tracks.size>MAX_PENDING)tracks.delete(tracks.keys().next().value);
  return entry;
 }
 function tap(type,action,value){
  if(!checkScope())return;
  const now=performance.now();
  if(type==='hostTxn'){
   counts.hostTransactions++;
   counts[value?.committed?'hostCommitted':'hostAborted']++;
   add('hostTransactionMs',value?.durationMs);
   return;
  }
  const t=track(action?.eventId);
  if(!t)return;
  if(type==='send'&&!number(t.sent)){
   t.sent=now;counts.localShots++;return;
  }
  if(type==='ack'&&!number(t.acked)){
   t.acked=now;counts.writeAck++;
   if(number(t.sent))add('writeAckMs',now-t.sent);
   return;
  }
  if(type==='failed'){counts.failedWrites++;tracks.delete(action.eventId);return;}
  if(type==='receive'&&!number(t.received)){
   t.received=now;counts.remoteShots++;
   // Date.now() adjusted by Firebase .info/serverTimeOffset is an estimate;
   // unlike performance.now() deltas, this is NOT a synchronized clock/RTT.
   add('remoteActionEstimatedAgeMs',value,-200,5000);
   if(number(t.visual)){
    counts.visualBeforeAction++;
    add('receiveToFirstVisualMs',t.visual-now,-AGE_LIMIT_MS,0);
   }
   return;
  }
  if(type==='visual'&&!number(t.visual)){
   t.visual=now;counts.firstVisuals++;
   if(number(t.received))add('receiveToFirstVisualMs',now-t.received,0,AGE_LIMIT_MS);
  }
 }
 function snapshot(state){
  if(!checkScope()||!state||state.matchId!==game.matchId||state.round!==game.round)return;
  const now=performance.now(),receipts=state.usedActions||{};
  for(const [id,t]of tracks){
   if(now-t.updatedAt>AGE_LIMIT_MS){tracks.delete(id);continue;}
   if(t.receipt)continue;
   const rec=receipts[id];
   if(!rec||rec.status!=='accepted')continue;
   t.receipt=now;counts.authoritativeReceipts++;
   if(number(t.received))add('receiveToReceiptMs',now-t.received);
   if(number(t.sent))add('sendToReceiptMs',now-t.sent);
  }
 }
 function quantiles(key){
  const a=values[key].slice().sort((x,y)=>x-y);
  const at=p=>a[Math.max(0,Math.ceil(a.length*p)-1)]??null;
  return {samples:a.length,p50Ms:at(.5),p95Ms:at(.95),maxMs:at(1)};
 }
 function report(){
  return {version:'V3.9',running:active,hasSamples:Object.values(values).some(v=>v.length>0),
   sampleSeconds:Math.round(Math.max(0,performance.now()-startedAt)/100)/10,
   events:{...counts},
   stages:Object.fromEntries(METRICS.map(key=>[key,quantiles(key)])),
   caveats:[
    'Local performance.now durations are same-device only; cross-device stages are not directly additive.',
    'remoteActionEstimatedAgeMs is not RTT: serverTimeOffset and device clocks may drift.',
    'writeAckMs measures SDK write completion, not game confirmation or ping.',
    'Visual event means canvas draw submission, not physical display.',
    'Server performance and Firebase network path are not directly observed.',
    'Per-action identifiers are never present in this report.'
   ]};
 }
 function start(){
  fresh();scope=currentScope()||'';startedAt=performance.now();active=true;
  return {running:true,localOnly:true,automaticTimer:false};
 }
 function stop(){active=false;const r=report();tracks.clear();return r;}
 function reset(){active=false;scope='';startedAt=0;fresh();return {running:false};}
 window.__brawlLagV39QA=Object.freeze({
  start,stop,report,reset,tap,snapshot,status:()=>({running:active,tracked:tracks.size})
 });
})();
