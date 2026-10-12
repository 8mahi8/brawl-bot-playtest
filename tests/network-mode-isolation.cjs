// Offline tests only. Intentionally test TWO separate transport adapters:
// do not turn a two-person room into a four-player quorum/host protocol.
'use strict';
const assert=require('node:assert/strict');
const {BASELINE:one,createPairChannel}=require('../network/lab/one-vs-one.cjs');
const {BASELINE:two,createSquadChannel}=require('../network/lab/two-vs-two.cjs');
const position=(seq,extra={})=>({round:1,seq,x:200+seq*.1,y:220,vx:40,vy:0,angle:0,t:1000+seq*80,...extra});
const scoped=(seq,extra={})=>({
 matchId:'m1',round:1,seq,motionRev:0,life:0,connectionId:'connection-1',x:200+seq*.1,y:220,a:0,...extra
});
const seats={blue1:{id:'p'},blue2:{id:'a'},red1:{id:'e'},red2:{id:'f'}};
const presence=Object.fromEntries(['p','a','e','f'].map(x=>[x,{'connection-1':{since:0}}]));
const motions=Object.fromEntries(['p','a','e','f'].map(x=>[x,{rev:0}]));
const lives={p:0,a:0,e:0,f:0};
const bootSquad=()=>{const ch=createSquadChannel();ch.reset({match:'m1',nextRound:1,seats,presence,motions,lives});return ch};
let passes=0;function test(name,fn){fn();passes++;console.log('PASS '+name);}
test('Contracts remain separate: 1vs1 room, 2vs2 room, protocol, payload and quorum',()=>{
 assert.equal(one.players,2);assert.equal(two.players,4);assert.equal(one.root,'rooms');assert.equal(two.root,'rooms2v2');
 assert.notEqual(one.legacyProtocol,two.legacyProtocol);assert.equal(one.sendMs,80);assert.equal(two.positionSendMs,80);
 assert.equal(two.hostTickMs,100);
});
test('1vs1 rejects wrong role, stale seq, old round, out-of-bounds, bad numbers',()=>{
 const c=createPairChannel(),generation=c.reset({roomId:'pair1',nextRound:1});
 assert(c.ingest('guest',position(1)));
 assert(!c.ingest('guest',position(1)));assert(!c.ingest('guest',position(0)));
 assert(!c.ingest('spectator',position(2)));assert(!c.ingest('guest',position(2,{round:2})));
 assert(!c.ingest('guest',position(2,{x:NaN})));assert(!c.ingest('guest',position(2,{x:5})));
 assert(!c.ingest('guest',position(2),{sourceGeneration:generation-1}));
 assert.equal(c.stats.accepted,1);
});
test('1vs1 prevents old-room/old-round packets from resurrecting movement',()=>{
 const c=createPairChannel(),old=c.reset({roomId:'old',nextRound:1});c.ingest('guest',position(8));
 c.reset({roomId:'new',nextRound:2});
 assert.equal(c.predict('guest',1400),null);
 assert(!c.ingest('guest',position(999,{round:2}),{sourceGeneration:old}));
 assert(!c.ingest('guest',position(999)));
 assert(c.ingest('guest',position(1,{round:2})));c.offline();
 assert.equal(c.predict('guest',1600),null);
});
test('1vs1 remote position prediction caps extrapolation to 150ms and bounds it',()=>{
 const c=createPairChannel();c.reset({roomId:'abc',nextRound:1});
 c.ingest('guest',position(1,{x:970,vx:10000,t:1000}));
 const p=c.predict('guest',4000,{extraMs:400});
 assert.equal(p.x,980);assert.equal(p.ageMs,3000);
});
test('1vs1 coalesces updates until 80ms, preserves latest payload and urgent send',()=>{
 const c=createPairChannel();c.reset({roomId:'abc',nextRound:1});
 assert.equal(c.queueLocal('host',position(1),0).seq,1);
 assert.equal(c.queueLocal('host',position(2),30),null);
 assert.equal(c.queueLocal('host',position(3),60),null);
 assert.equal(c.flush('host',79),null);
 assert.equal(c.flush('host',80).seq,3);
 assert.equal(c.queueLocal('host',position(4),90,{urgent:true}).seq,4);
 assert.equal(c.stats.transmissions,3);assert(c.stats.coalesced>=1);
});
test('2vs2 validates match, round, seat, active connection and life/revision',()=>{
 const c=bootSquad();
 assert(c.ingest('p',scoped(1)));
 for(const bad of [
  scoped(2,{matchId:'other'}),scoped(2,{round:2}),scoped(2,{connectionId:'removed'}),
  scoped(2,{motionRev:1}),scoped(2,{life:1}),scoped(2,{x:-1}),scoped(2,{a:NaN})
 ])assert(!c.ingest('p',bad));
 assert(!c.ingest('unknown',scoped(2)));
 assert.equal(c.getPosition('p').seq,1);
 assert(c.ingest('p',scoped(2)));assert(!c.ingest('p',scoped(1)));
});
test('2vs2 protects against old listener callbacks after room/match reattachment',()=>{
 const c=bootSquad(),epoch=c.scope.epoch;c.ingest('p',scoped(8));
 c.reset({match:'m2',nextRound:1,seats,presence,motions,lives});
 assert(!c.ingest('p',scoped(999,{matchId:'m2'}),{sourceEpoch:epoch}));
 assert(!c.ingest('p',scoped(9,{matchId:'m1'})));
 assert(c.ingest('p',scoped(1,{matchId:'m2'})));
 assert.equal(c.getPosition('p').seq,1);
});
test('2vs2 invalidates old connection after presence removal and accepts a new one',()=>{
 const c=bootSquad();assert(c.ingest('p',scoped(40)));
 const next=structuredClone(presence);next.p={'connection-2':{since:1000}};c.setPresence(next);
 assert.equal(c.getPosition('p'),null);assert(!c.ingest('p',scoped(999)));
 assert(c.ingest('p',scoped(1,{connectionId:'connection-2'})));
 assert.equal(c.getPosition('p').connectionId,'connection-2');
});
test('2vs2 motion correction and respawn life discard the previous position',()=>{
 const c=bootSquad();assert(c.ingest('e',scoped(10)));
 c.updateAuthoritative({motions:{...motions,e:{rev:1}},lives});
 assert.equal(c.getPosition('e'),null);
 assert(!c.ingest('e',scoped(11)));assert(c.ingest('e',scoped(1,{motionRev:1})));
 c.updateAuthoritative({lives:{...lives,e:1}});
 assert.equal(c.getPosition('e'),null);
 assert(!c.ingest('e',scoped(12,{motionRev:1})));
 assert(c.ingest('e',scoped(1,{motionRev:1,life:1})));
});
test('2vs2 batch snapshots can contain four accepted positions without trusting a spectator',()=>{
 const c=bootSquad();
 const batch=[['p',scoped(1)],['a',scoped(2)],['e',scoped(1)],['f',scoped(3)],['spectator',scoped(5)]];
 const r=c.ingestBatch(batch);
 assert.equal(r.accepted.length,4);assert.deepEqual(r.discarded,['spectator']);
 assert.equal(c.stats.accepted,4);
});
test('2vs2 coalesces per player without treating all four as a single seq',()=>{
 const c=bootSquad();
 assert.equal(c.queueLocal('p',scoped(1),0).seq,1);assert.equal(c.queueLocal('e',scoped(1),0).seq,1);
 assert.equal(c.queueLocal('p',scoped(2),20),null);
 assert.equal(c.queueLocal('p',scoped(3),70),null);
 assert.equal(c.flush('p',80).seq,3);
 assert.equal(c.flush('e',80),null);
 assert.equal(c.stats.transmissions,3);
 c.offline();assert(!c.ingest('p',scoped(4)));assert.equal(c.getPosition('p'),null);
});
test('2vs2 refuses invalid duplicate-seat and malformed player configurations',()=>{
 assert.throws(()=>createSquadChannel({sendMs:0}));
 const c=createSquadChannel();
 assert.throws(()=>c.reset({match:'a',nextRound:1,seats:{...seats,blue2:{id:'p'}},presence,motions,lives}));
});
console.log('PASS '+passes+' distinct mode-specific communication QA categories; no real Firebase calls');
