// ONLINE LAB ONLY. 2-person session/position path, NOT included in production HTML.
// Based on the preserved V2.8 host/guest schema and SEND_MS=80.
// A dedicated 1v1 adapter avoids forcing 4-player host/presence logic into pair matches.
'use strict';
const BASELINE=Object.freeze({players:2,root:'rooms',legacyProtocol:28,sendMs:80,world:{width:1000,height:600,radius:20},predictionCapMs:150});
function validNumber(x){return typeof x==='number'&&Number.isFinite(x);}
function createPairChannel({sendMs=BASELINE.sendMs,maxPredictionMs=BASELINE.predictionCapMs}={}){
 if(!Number.isSafeInteger(sendMs)||sendMs<30)throw Error('invalid 1v1 sendMs');
 const latest=new Map();const sequence=new Map(),lastSent=new Map();
 let room=null,round=0,generation=0,connected=false;
 const stats={accepted:0,rejected:0,stale:0,transmissions:0,coalesced:0};
 function reset({roomId,nextRound,online=true}){
  if(typeof roomId!=='string'||!roomId)throw Error('roomId required');
  if(!Number.isSafeInteger(nextRound)||nextRound<0)throw Error('round required');
  room=roomId;round=nextRound;connected=online;generation++;latest.clear();sequence.clear();lastSent.clear();
  return generation;
 }
 function offline(){connected=false;generation++;latest.clear();sequence.clear();lastSent.clear();}
 function valid(p){
  return !!p&&Number.isSafeInteger(p.round)&&p.round===round&&Number.isSafeInteger(p.seq)&&p.seq>=0&&
   validNumber(p.x)&&validNumber(p.y)&&validNumber(p.vx)&&validNumber(p.vy)&&validNumber(p.angle)&&
   p.x>=BASELINE.world.radius&&p.x<=BASELINE.world.width-BASELINE.world.radius&&
   p.y>=BASELINE.world.radius&&p.y<=BASELINE.world.height-BASELINE.world.radius;
 }
 function ingest(role,p,{sourceGeneration=generation}={}){
  if(!connected||sourceGeneration!==generation||!(role==='host'||role==='guest')||!valid(p)){stats.rejected++;return false;}
  const prior=sequence.get(role);
  if(prior!==undefined&&p.seq<=prior){stats.stale++;return false;}
  latest.set(role,{...p});sequence.set(role,p.seq);stats.accepted++;return true;
 }
 function queueLocal(role,p,now,{urgent=false}={}){
  if(!connected||!room||!(role==='host'||role==='guest')||!valid(p)||!validNumber(now))return null;
  // Per role, repeated movement updates before the next 80ms send collapse into latest.
  const prior=lastSent.get(role);
  const pending=latest.get('out:'+role);
  if(pending)stats.coalesced++;
  latest.set('out:'+role,{...p});
  if(!urgent&&prior!==undefined&&now-prior<sendMs)return null;
  const result=latest.get('out:'+role);latest.delete('out:'+role);
  lastSent.set(role,now);stats.transmissions++;return result;
 }
 function flush(role,now){
  if(!connected||!validNumber(now)||!(role==='host'||role==='guest'))return null;
  const candidate=latest.get('out:'+role);if(!candidate)return null;
  const prior=lastSent.get(role);
  if(prior!==undefined&&now-prior<sendMs)return null;
  latest.delete('out:'+role);lastSent.set(role,now);stats.transmissions++;return candidate;
 }
 function predict(role,serverNow,{extraMs=0}={}){
  const p=latest.get(role);if(!p)return null;
  const age=validNumber(p.t)?Math.max(0,serverNow-p.t):0;
  const ahead=Math.min(maxPredictionMs,Math.min(age,120)+Math.max(0,extraMs))/1000;
  const r=BASELINE.world.radius,{width,height}=BASELINE.world;
  return {x:Math.max(r,Math.min(width-r,p.x+p.vx*ahead)),y:Math.max(r,Math.min(height-r,p.y+p.vy*ahead)),ageMs:age};
 }
 return {kind:'1vs1',reset,offline,ingest,queueLocal,flush,predict,get stats(){return {...stats};},get generation(){return generation;},get scope(){return {room,round,connected};}};
}
module.exports={BASELINE,createPairChannel};
