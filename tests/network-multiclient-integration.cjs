// Multi-client INTEGRATION LAB: exercise REAL BRAWL V8 reducers in each generated
// foundation HTML with separate virtual pair/squad transports, no live network.
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {createPairChannel}=require('../network/lab/one-vs-one.cjs');
const {createSquadChannel}=require('../network/lab/two-vs-two.cjs');
const chars={
 tank:{hp:180,reload:2500/3,damage:11,range:160},
 gunner:{hp:100,reload:1250,damage:10,range:280},
 sniper:{hp:70,reload:5500/3,damage:36,range:455},
 bomber:{hp:90,reload:1500,damage:28,range:300}
};
const cases={
 '1v1':{
  seatKeys:['blue1','red1'],
  seats:{blue1:{id:'p',char:'gunner'},red1:{id:'e',char:'tank'}},
  positions:{p:{x:200,y:300},e:{x:270,y:300}},
  spawns:{blue1:{x:200,y:300},red1:{x:270,y:300}},
  role:{p:'host',e:'guest'},
  size:{width:1000,height:600,radius:20}
 },
 '2v2':{
  seatKeys:['blue1','blue2','red1','red2'],
  seats:{blue1:{id:'p',char:'gunner'},blue2:{id:'a',char:'tank'},red1:{id:'e',char:'tank'},red2:{id:'f',char:'sniper'}},
  positions:{p:{x:200,y:300},a:{x:300,y:420},e:{x:270,y:300},f:{x:750,y:420}},
  spawns:{blue1:{x:200,y:300},blue2:{x:300,y:420},red1:{x:270,y:300},red2:{x:750,y:420}},
  size:{width:1536,height:860,radius:18}
 }
};
function loadCore(mode){
 const html=fs.readFileSync('foundation/'+mode+'-foundation-v1.html','utf8'),
  script=html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
 assert(script,'generated candidate inline script '+mode);
 const part=(a,b)=>{const start=script.indexOf(a),end=script.indexOf(b,start);assert(start>=0&&end>start,'missing '+a);return script.slice(start,end);};
 const segments=[
  ['/* BEGIN COMBAT CORE','/* END COMBAT CORE'],
  ['/* BEGIN SHARED WEAPON RULES */','/* END SHARED WEAPON RULES */'],
  ['/* BEGIN SHARED PROJECTILE PHYSICS */','/* END SHARED PROJECTILE PHYSICS */'],
  ['/* BEGIN SHARED MATCH STATE */','/* END SHARED MATCH STATE */'],
  ['/* BEGIN SHARED ABILITIES */','/* END SHARED ABILITIES */']
 ].map(pair=>part(...pair));
 const ctx={structuredClone};
 vm.runInNewContext(segments.join('\n'),ctx,{filename:mode});
 return ctx.BrawlCombatV8;
}
function run(mode,{delayMs=150}={}){
 const scenario=cases[mode],isSquad=mode==='2v2';
 const engine=loadCore(mode).create({chars,walls:[],spawns:scenario.spawns,seatKeys:scenario.seatKeys});
 const peerIds=scenario.seatKeys.map(key=>scenario.seats[key].id);
 const matchId='integration',oldToken='lease-original',newToken='lease-reconnected';
 let host=engine.initialize(matchId,scenario.seats,'ko',0);host.hostToken=oldToken;
 const initialHp=host.hp.e;
 // Each client submits positions to the room independently. Network receipt is
 // filtered through the MODE-SPECIFIC adapter BEFORE positions reach V8.
 const transport=isSquad?createSquadChannel(scenario.size):createPairChannel();
 const presence=Object.fromEntries(peerIds.map(id=>[id,{conn1:{since:0}}]));
 const motions=Object.fromEntries(peerIds.map(id=>[id,{rev:0}]));
 const lives=Object.fromEntries(peerIds.map(id=>[id,0]));
 if(isSquad)transport.reset({match:matchId,nextRound:1,seats:scenario.seats,presence,motions,lives});
 else transport.reset({roomId:'pair-room',nextRound:1});
 const hostInputs={},pending=[];
 let sent=0,arrived=0;
 for(const [index,id]of peerIds.entries()){
  const coords=scenario.positions[id];
  const packet=isSquad?
   {matchId,round:1,connectionId:'conn1',motionRev:0,life:0,seq:1,x:coords.x,y:coords.y,a:0}:
   {round:1,seq:1,x:coords.x,y:coords.y,angle:0,vx:0,vy:0,t:10};
  const key=isSquad?id:scenario.role[id];
  const outbound=transport.queueLocal(key,packet,0);
  assert(outbound,'first movement must be sent for '+id);
  sent++;pending.push({id,key,packet:outbound,at:delayMs+index*9});
 }
 pending.sort((a,b)=>b.at-a.at); // in-flight order can differ
 for(const event of pending){
  const accept=transport.ingest(event.key,event.packet);
  assert(accept,'position accepted for '+event.id);
  arrived++;
  hostInputs[event.id]={...scenario.positions[event.id],matchId,round:1,motionRev:0,life:0};
 }
 assert.equal(Object.keys(hostInputs).length,peerIds.length,'every client position is received');
 // Inject a stale/replayed packet after a newer one, without letting it
 // overwrite the authoritative position.
 const replay=pending[0];
 assert(!transport.ingest(replay.key,replay.packet),'replayed position rejected');
 const clientSnapshots=Object.fromEntries(peerIds.map(id=>[id,{combatRev:-1,game:null}]));
 function fanout(snapshot,now){
  const wire=structuredClone(snapshot);
  for(const id of peerIds){
   const target=clientSnapshots[id];
   if(wire.matchId!==matchId||wire.round!==1||wire.combatRev<target.combatRev)continue;
   target.game=structuredClone(wire);target.combatRev=wire.combatRev;
  }
 }
 fanout(host,200);
 const action={eventId:'first-shot',owner:'p',matchId,round:1,seq:1,life:0,type:'shot',
  angle:0,reach:310,x:200,y:300,at:200};
 const before=host,after=engine.accept(host,action,hostInputs,200);
 assert.equal(after.usedActions['first-shot']?.status,'accepted',mode+' authoritative shot accepted');
 assert.equal(after.stats.p.ammo,before.stats.p.ammo-1,'host alone spends ammo');
 host=after;
 const replayAction=engine.accept(host,action,hostInputs,250);
 assert.equal(replayAction.stats.p.ammo,host.stats.p.ammo,'duplicate action does not spend a second ammo');
 assert.equal(Object.keys(replayAction.projectiles).length,Object.keys(host.projectiles).length,'duplicate action adds no bullets');
 // Advance one authoritative host tick. This uses actual V8 collision and
 // damage code, not a stand-in damage calculator.
 host=engine.step(host,hostInputs,300,host.combatRev,oldToken);
 assert.equal(host.combatRev,1,mode+' host tick increments one revision');
 assert.equal(initialHp-host.hp.e,10,mode+' only first gunner burst pellet may land in the first 100ms; both modes stagger the rest');
 assert(Object.values(host.events).some(e=>e.type==='hit'&&e.victim==='e'),'host emits a hit event');
 const confirmed=structuredClone(host);
 // New snapshot can arrive before a delayed older one. Client read models
 // must stay at the latest *host-authoritative* combat revision.
 fanout(host,300+delayMs);fanout(before,400+delayMs);
 for(const [id,client]of Object.entries(clientSnapshots)){
  assert.equal(client.combatRev,1,mode+': '+id+' has latest revision');
  assert.equal(client.game.hp.e,host.hp.e,mode+': '+id+' sees exact host-confirmed HP');
 }
 // A disconnected or obsolete host token must never commit the next tick.
 host=structuredClone(host);host.hostToken=newToken;
 const stale=engine.step(host,hostInputs,400,host.combatRev,oldToken);
 assert.equal(stale.combatRev,host.combatRev,'old host lease must not advance combat');
 const wrongRev=engine.step(host,hostInputs,400,host.combatRev-1,newToken);
 assert.equal(wrongRev.combatRev,host.combatRev,'outdated reducer revision cannot commit');
 const advanced=engine.step(host,hostInputs,400,host.combatRev,newToken);
 assert.equal(advanced.combatRev,2,'current lease can continue match');
 assert.equal(initialHp-advanced.hp.e,20,mode+' second gunner burst hit lands at ~105ms');
 const third=engine.step(advanced,hostInputs,500,advanced.combatRev,newToken);
 assert.equal(third.combatRev,3);
 assert.equal(initialHp-third.hp.e,30,mode+' third gunner burst hit lands at ~210ms');
 // Delayed packets from old connection/life/round are discarded. 1v1 V2.8
 // only validates role/round/generation, not a connectionId.
 if(isSquad){
  const oldEpoch=transport.scope.epoch;
  const nextPresence=structuredClone(presence);
  nextPresence.e={conn2:{since:500}};
  transport.setPresence(nextPresence);
  assert(!transport.ingest('e',{matchId,round:1,connectionId:'conn1',motionRev:0,life:0,seq:999,x:270,y:300,a:0}));
  assert(transport.ingest('e',{matchId,round:1,connectionId:'conn2',motionRev:0,life:0,seq:1,x:270,y:300,a:0}));
  transport.reset({match:'new-match',nextRound:1,seats:scenario.seats,presence:nextPresence,motions,lives});
  assert(!transport.ingest('e',{matchId:'new-match',round:1,connectionId:'conn2',motionRev:0,life:0,seq:1000,x:270,y:300,a:0},{sourceEpoch:oldEpoch}));
 }else{
  const oldGeneration=transport.generation;
  transport.reset({roomId:'next-room',nextRound:1});
  assert(!transport.ingest('guest',{round:1,seq:999,x:270,y:300,angle:0,vx:0,vy:0},{sourceGeneration:oldGeneration}));
 }
 return {players:peerIds.length,deliveredPositions:arrived,positionWrites:sent,damage:initialHp-confirmed.hp.e,
  hpAfter:confirmed.hp.e,snapshots:peerIds.length,hostCombatRevisions:advanced.combatRev,simulatedOneWayDelayMs:delayMs};
}
for(const mode of ['1v1','2v2']){
 for(const delay of [0,150,300,600]){
  const result=run(mode,{delayMs:delay});
  console.log('PASS '+mode+' simulated '+delay+'ms: '+JSON.stringify(result));
 }
}
console.log('PASS 2-client/4-client candidate V8 host-authoritative movement, shot, damage, stale updates, duplicate actions and simulated failover');
console.log('LAB ONLY: No real RTDB, Firebase Auth/Rules, network browser, Safari, or real host election verified.');
