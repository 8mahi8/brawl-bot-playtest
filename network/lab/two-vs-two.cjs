// ONLINE LAB ONLY. Four-player scoped position/presence ingestion.
// Mirrors preserved 2vs2 ALPHA10 origin schema. Not bundled into existing BOT pages.
'use strict';
const BASELINE=Object.freeze({
 players:4,root:'rooms2v2',legacyProtocol:3010,
 positionSendMs:80,hostTickMs:100,
 seats:['blue1','blue2','red1','red2'],
 world:{width:1000,height:600,radius:20}
});
const finite=x=>typeof x==='number'&&Number.isFinite(x);
function createSquadChannel({width=BASELINE.world.width,height=BASELINE.world.height,radius=BASELINE.world.radius,sendMs=BASELINE.positionSendMs}={}){
 if(!Number.isSafeInteger(sendMs)||sendMs<30||!finite(width)||!finite(height)||!finite(radius))throw Error('invalid four-player transport options');
 let matchId='',round=-1,epoch=0,connected=false,presence={},seats={},motions={},lives={};
 const accepted=new Map(),outbound=new Map(),lastSent=new Map();
 const stats={accepted:0,rejected:0,stale:0,coalesced:0,transmissions:0,invalidScope:0,invalidPresence:0};
 const allowedId=id=>BASELINE.seats.some(k=>seats[k]?.id===id);
 function reset({match,nextRound,seats:players,motions:move={},lives:life={},presence:registered={},online=true}){
  if(typeof match!=='string'||!match||!Number.isSafeInteger(nextRound)||nextRound<1)throw Error('match scope required');
  if(!players||BASELINE.seats.some(k=>typeof players[k]?.id!=='string'||!players[k].id))throw Error('four seats required');
  const ids=BASELINE.seats.map(k=>players[k].id);
  if(new Set(ids).size!==4)throw Error('four-player IDs must be distinct');
  matchId=match;round=nextRound;seats=structuredClone(players);motions=structuredClone(move);lives=structuredClone(life);
  presence=structuredClone(registered);connected=online;epoch++;accepted.clear();outbound.clear();lastSent.clear();return epoch;
 }
 function setPresence(nextPresence){presence=structuredClone(nextPresence||{});for(const [id,p] of accepted){if(!presence?.[id]?.[p.connectionId])accepted.delete(id);}}
 function updateAuthoritative({motions:move,lives:life}){
  if(move)motions=structuredClone(move);
  if(life)lives=structuredClone(life);
  for(const [id,p] of accepted){
   if(p.motionRev!==(motions[id]?.rev||0)||p.life!==(lives[id]||0))accepted.delete(id);
  }
 }
 function offline(){connected=false;epoch++;accepted.clear();outbound.clear();lastSent.clear();}
 function validPayload(p){
  return !!p&&p.matchId===matchId&&p.round===round&&Number.isSafeInteger(p.seq)&&p.seq>=0&&
   Number.isSafeInteger(p.motionRev)&&p.motionRev>=0&&Number.isSafeInteger(p.life)&&p.life>=0&&
   typeof p.connectionId==='string'&&p.connectionId.length>0&&
   finite(p.x)&&finite(p.y)&&finite(p.a)&&p.x>=radius&&p.x<=width-radius&&p.y>=radius&&p.y<=height-radius;
 }
 function ingest(id,p,{sourceEpoch=epoch}={}){
  if(!connected||sourceEpoch!==epoch||!allowedId(id)||!validPayload(p)){stats.rejected++;stats.invalidScope++;return false;}
  if(!presence?.[id]?.[p.connectionId]){stats.rejected++;stats.invalidPresence++;return false;}
  if(p.life!==(lives[id]||0)||p.motionRev!==(motions[id]?.rev||0)){stats.rejected++;stats.invalidScope++;return false;}
  const prior=accepted.get(id);
  if(prior&&prior.connectionId===p.connectionId&&prior.life===p.life&&prior.motionRev===p.motionRev&&p.seq<=prior.seq){
   stats.stale++;return false;
  }
  accepted.set(id,{...p});stats.accepted++;return true;
 }
 function ingestBatch(list,{sourceEpoch=epoch}={}){
  // One render pass per incoming snapshot; do not redraw for each of 4 child updates.
  const result={accepted:[],discarded:[]};
  for(const [id,p] of list){if(ingest(id,p,{sourceEpoch}))result.accepted.push(id);else result.discarded.push(id);}
  return result;
 }
 function queueLocal(id,p,now,{urgent=false}={}){
  if(!connected||!allowedId(id)||!validPayload(p)||!finite(now))return null;
  if(!presence?.[id]?.[p.connectionId])return null;
  if(p.life!==(lives[id]||0)||p.motionRev!==(motions[id]?.rev||0))return null;
  if(outbound.has(id))stats.coalesced++;
  outbound.set(id,{...p});
  if(!urgent&&lastSent.has(id)&&now-lastSent.get(id)<sendMs)return null;
  const send=outbound.get(id);outbound.delete(id);lastSent.set(id,now);stats.transmissions++;return send;
 }
 function flush(id,now){
  if(!connected||!finite(now)||!outbound.has(id))return null;
  if(lastSent.has(id)&&now-lastSent.get(id)<sendMs)return null;
  const send=outbound.get(id);outbound.delete(id);
  if(!presence?.[id]?.[send.connectionId])return null;
  lastSent.set(id,now);stats.transmissions++;return send;
 }
 function getPosition(id){const p=accepted.get(id);return p?{...p}:null;}
 return {kind:'2vs2',reset,offline,setPresence,updateAuthoritative,ingest,ingestBatch,queueLocal,flush,getPosition,
  get scope(){return {matchId,round,epoch,connected};},get stats(){return {...stats};}};
}
module.exports={BASELINE,createSquadChannel};
