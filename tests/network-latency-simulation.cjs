// Synthetic delays only: no real Firebase transport, Wi-Fi or Safari inference.
// Confirm that separate 1v1 and 2v2 position filters tolerate jitter and reordering
// without accepting stale scope, corrupting scores or silently mixing room families.
'use strict';
const assert=require('node:assert/strict');
const {createPairChannel,BASELINE:pairSpec}=require('../network/lab/one-vs-one.cjs');
const {createSquadChannel,BASELINE:squadSpec}=require('../network/lab/two-vs-two.cjs');
const seats={blue1:{id:'p'},blue2:{id:'a'},red1:{id:'e'},red2:{id:'f'}};
const ids=['p','a','e','f'];
const presence=Object.fromEntries(ids.map(id=>[id,{conn1:{since:0}}]));
const motions=Object.fromEntries(ids.map(id=>[id,{rev:0}]));
const lives=Object.fromEntries(ids.map(id=>[id,0]));
const delays=[0,150,300,600];
const table=[];
function runPair(lagMs){
 const channel=createPairChannel();channel.reset({roomId:'testing',nextRound:1});
 const events=[];let sent=0;
 for(let t=0;t<=2000;t+=16){
  for(const [i,role] of ['host','guest'].entries()){
   const seq=t/16+1,raw={round:1,seq,x:220+seq*.11+i*160,y:250,vx:10,vy:0,angle:0,t};
   const out=channel.queueLocal(role,raw,t);
   if(!out)continue;
   events.push({arrive:t+lagMs+((seq*37+i*17)%7)*32,role,packet:out});sent++;
  }
 }
 events.sort((a,b)=>a.arrive-b.arrive);
 for(const event of events)channel.ingest(event.role,event.packet);
 const a=channel.predict('guest',2500,{extraMs:10});
 assert(a&&a.x>=20&&a.x<=980);
 assert.equal(channel.stats.transmissions,sent);
 assert.equal(channel.stats.accepted+channel.stats.stale,sent);
 assert(sent>=40&&sent<=54,'80ms cadence, not one send per 16ms render update');
 return {sent,accepted:channel.stats.accepted,discardedStale:channel.stats.stale,coalesced:channel.stats.coalesced};
}
function runSquad(lagMs){
 const channel=createSquadChannel();
 channel.reset({match:'m',nextRound:1,seats,presence,motions,lives});
 const events=[];let sent=0;
 for(let t=0;t<=2000;t+=16){
  for(const [i,id]of ids.entries()){
   const seq=t/16+1,raw={matchId:'m',round:1,seq,life:0,motionRev:0,connectionId:'conn1',x:220+seq*.1+i*110,y:250,a:0};
   const out=channel.queueLocal(id,raw,t);
   if(!out)continue;
   events.push({arrive:t+lagMs+((seq*37+i*17)%7)*32,id,packet:out});sent++;
  }
 }
 events.sort((a,b)=>a.arrive-b.arrive);
 const accepted=channel.ingestBatch(events.map(e=>[e.id,e.packet])).accepted.length;
 assert.equal(channel.stats.transmissions,sent);
 assert.equal(channel.stats.accepted+channel.stats.stale,sent);
 assert(sent>=80&&sent<=108,'four writers at 80ms cadence');
 for(const id of ids)assert(channel.getPosition(id),'every player receives a position');
 const staleEpoch=channel.scope.epoch;channel.offline();
 assert(!channel.ingest('p',{...events[events.length-1].packet}, {sourceEpoch:staleEpoch}),'offline rejects late callbacks');
 assert.equal(channel.getPosition('p'),null,'disconnect invalidates all old movements');
 return {sent,accepted,discardedStale:channel.stats.stale,coalesced:channel.stats.coalesced};
}
for(const d of delays){
 const a=runPair(d),b=runSquad(d);
 // Four players create ~2x position write pressure before any host transactions.
 assert.equal(b.sent,2*a.sent);
 // Message shaping under 16ms client render loop should bound position write count.
 assert(a.coalesced>0&&b.coalesced>0);
 table.push({syntheticDelayMs:d,pairWrites:a.sent,squadWrites:b.sent,pairStale:a.discardedStale,squadStale:b.discardedStale});
 console.log('PASS injected '+d+'ms delay: 2 players '+a.sent+' writes, 4 players '+b.sent+' writes, stale ignored '+a.discardedStale+'/'+b.discardedStale);
}
const two=createSquadChannel(),one=createPairChannel();
one.reset({roomId:'pair1',nextRound:1});
two.reset({match:'squad1',nextRound:1,seats,presence,motions,lives});
assert.notEqual(pairSpec.root,squadSpec.root);
assert.equal(one.kind,'1vs1');assert.equal(two.kind,'2vs2');
console.log('SYNTHETIC_SUMMARY '+JSON.stringify({durationMs:2000,renderStepMs:16,model:'deterministic queue + out-of-order jitter; not a Wi-Fi speed benchmark',table}));
console.log('PASS distinct 1v1 and 2v2 network models under synthetic 0/150/300/600 ms delayed delivery');
