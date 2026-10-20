'use strict';
const fs=require('node:fs'),assert=require('node:assert/strict'),vm=require('node:vm');
const {makeAll,spec}=require('../scripts/build-friends-online.cjs');
const text=fs.readFileSync(spec.modules.squadActionStream,'utf8');
const start=text.indexOf(' function drainActions()'),end=text.indexOf('function submitAction(',start);
assert(start>=0&&end>start);
const fn=text.slice(start,end);
assert(fn.includes('if(!pendingActions.size){scheduleHostActionDispatch();return;}'),
 'empty maps should not trigger 50 position update scans per second');
assert(fn.includes('const sorted=isAuthoritative()?'),'only host must sort');
const peers=[{eventId:'b1',owner:'beta',seq:1},
 {eventId:'a2',owner:'alpha',seq:2},{eventId:'a1',owner:'alpha',seq:1}];
const make=(isHost=false)=>{
 let dispatched=0,retired=[];
 const pendingActions=new Map(peers.map(a=>[a.eventId,{action:{
  ...a,matchId:'m',round:1,at:900,type:'shot'},networkSeen:true}]));
 const ctx={pendingActions,clockReady:true,now:1000,serverNow:()=>1000,
  ACTION_TTL:3000,ACTION_FUTURE:250,failedLocalActions:new Set(),clientBullets:[],
  lobbyReady:true,gameReady:true,presenceReady:true,positionsReady:true,pageSuspended:false,
  lobby:{matchId:'m'},game:{matchId:'m',round:1,phase:'playing',stats:{},usedActions:{}},
  roundResetKey:'m:1',myId:'host',localPendingWrites:new Set(),
  isAuthoritative:()=>isHost,playerSeat:()=>true,
  paused:false,queuedActions:new Set(),hostQueue:[],
  seenActions:new Set(),validActionReceipt:(a,r)=>!!r&&a.eventId===r.eventId,
  boundedRemember:(set,id)=>{set.add(id);retired.push(id)},
  scheduleHostActionDispatch:()=>{dispatched++},
  Map,Set,Math,Number,console};
 vm.createContext(ctx);vm.runInContext(fn,ctx);
 return {ctx,drain:()=>vm.runInContext('drainActions()',ctx),events:()=>({dispatched,retired})};
};
const idle=make();idle.ctx.pendingActions.clear();idle.drain();
assert.equal(idle.events().dispatched,1,'host dispatcher must not be starved by empty map');
assert.equal(idle.ctx.hostQueue.length,0);
const host=make(true);host.drain();
assert.deepEqual(host.ctx.hostQueue.map(a=>a.eventId),['a1','a2','b1'],
 'authoritative host retains stable per-player ordering');
assert.equal(host.events().dispatched,1);
const guest=make(false);guest.drain();
assert.equal(guest.ctx.hostQueue.length,0,'guest never processes remote host actions');
assert.equal(guest.ctx.pendingActions.size,3,'unconfirmed actions remain tracked');
guest.ctx.game.usedActions={b1:{eventId:'b1'},a1:{eventId:'a1'}};
guest.drain();
assert.deepEqual([...guest.ctx.pendingActions.keys()],['a2'],
 'guest safely removes receipts from map iterator without sorting/copying');
assert.equal(guest.ctx.seenActions.size,2,'handled receipts cannot replay');
const built=makeAll(null,null,null,null,null,false);
for(const name of ['normal.2vs2','draft.2vs2']){
 assert(built[name].html.includes(text),'normal/draft 2v2 share optimization');
}
for(const name of ['normal.1vs1','draft.1vs1'])
 assert(!built[name].html.includes('const sorted=isAuthoritative()?'),'duels unchanged');
console.log('PASS V4.1 action hot-path: empty-map cheap return, guest no-sort/receipt prune, host deterministic queue, isolated modes');
