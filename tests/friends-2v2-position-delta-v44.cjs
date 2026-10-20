'use strict';
const fs=require('node:fs'),assert=require('node:assert/strict'),vm=require('node:vm');
const {spec,makeAll,patchSquadPositionDeltaV44}=require('../scripts/build-friends-online.cjs');
const src=fs.readFileSync(spec.modules.squadPositionDeltaV44,'utf8');
assert(!/\.(?:set|transaction|update|remove|push)\s*\(|\bfetch\s*\(|\blocalStorage\b|\bsetTimeout\b/.test(src),
 'position delta subscription cannot introduce writes, traffic, timers or storage');
const built=makeAll(),unmodified=makeAll(null,null,null,null,null,false);
const legacy="watch(room.child('positions'),'value',snap=>";
for(const name of ['normal.2vs2','draft.2vs2']){
 const html=built[name].html;
 assert.equal(html.split('window.__brawlPositionV44QA=()=>').length-1,1,
  'single V4.4 module '+name);
 assert(!html.includes(legacy),'V4.4 may not keep redundant full subtree value listener '+name);
 assert(html.includes("subscribeSquadPositionDeltas(room.child('positions'),thisRoom,generation);"),
  'room lifecycle needs V4.4 subscription '+name);
 assert(unmodified[name].html.includes(legacy),'baseline remains available '+name);
 assert.throws(()=>patchSquadPositionDeltaV44(html,src,name),/already staged/);
}
for(const name of ['normal.1vs1','draft.1vs1'])
 assert(!built[name].html.includes('__brawlPositionV44QA'),'1v1 cannot inherit 2v2 network experiment');
const deferred=()=>{
 let yes,no;
 const promise=new Promise((resolve,reject)=>{yes=resolve;no=reject;});
 return {promise,yes,no};
};
const mk=(room)=>{
 const listeners=new Map(),initial=deferred(),errors=[];
 const ref={on(){},once:()=>initial.promise};
 const ctx={
 window:{},Map,Object,Number,Math,Array,Promise,
 room,roomGeneration:1,
 rawPositions:{},positions:{},positionsReady:false,remotePositionReceivedAt:new Map(),
 quietCanvasPoseRevision:0,myId:'me',presentationMetrics:{positionSnapshots:0},
 workTiming:{positionSnapshots:0,positionSnapshotTotalMs:0},
 performance:{now:(()=>{let t=0;return ()=>++t;})()},
 watch:(_,type,fn)=>listeners.set(type,fn),
 ingestPositions(){Object.assign(ctx.positions,ctx.rawPositions);ctx.ingests++;},
 reconcileRoomView(source){assert.equal(source,'positions');ctx.reconciles++;},
 status:e=>errors.push(e),errorText:e=>String(e),
 ingests:0,reconciles:0
 };
 vm.createContext(ctx);vm.runInContext(src,ctx);
 vm.runInContext('subscribeSquadPositionDeltas(_positionRef,room,1)',Object.assign(ctx,{_positionRef:ref}));
 const emit=(type,id,p)=>{
  const cb=listeners.get(type);assert(cb,'listener '+type);
  cb({key:id,val:()=>p});
 };
 return {ctx,ref,initial,emit,errors};
};
const pos=(seq,opts={})=>({seq,matchId:'match',round:1,connectionId:'one',motionRev:0,life:1,
 x:seq,y:seq*2,a:0,vx:0,vy:0,...opts});
async function flush(){await new Promise(r=>setImmediate(r));}
async function main(){
 const env=mk({});
 assert.deepEqual([...env.ctx.window.__brawlPositionV44QA&&[]],[],
  'probe exposed without IDs');
 assert.equal(env.ctx.positionsReady,false);
 // Live callback for sequence 3 arrives while the bootstrap snapshot was
 // recorded at seq 2; a stale initial read must NEVER snap the player back.
 env.emit('child_added','alice',pos(3));
 env.emit('child_removed','bob',{});
 assert.equal(env.ctx.positionsReady,false);
 env.initial.yes({val:()=>({alice:pos(2),bob:pos(1),charlie:pos(4)})});
 await flush();
 assert.equal(env.ctx.positionsReady,true);
 assert.equal(env.ctx.rawPositions.alice.seq,3,'initial snapshot cannot undo newer position');
 assert(!env.ctx.rawPositions.bob,'child_removed must not be resurrected');
 assert.equal(env.ctx.rawPositions.charlie.seq,4,'bootstrap fills untouched positions');
 assert.equal(env.ctx.reconciles,1);
 env.emit('child_changed','alice',pos(5));
 assert.equal(env.ctx.positions.alice.seq,5);
 assert.equal(env.ctx.window.__brawlPositionV44QA().staleDropped,0);
 env.emit('child_changed','alice',pos(4));
 assert.equal(env.ctx.rawPositions.alice.seq,5,'reject stale same-connection position seq');
 assert.equal(env.ctx.window.__brawlPositionV44QA().staleDropped,1);
 env.emit('child_changed','alice',pos(0,{round:2}));
 assert.equal(env.ctx.rawPositions.alice.round,2,'new round may reset its seq');
 env.emit('child_changed','alice',pos(1,{connectionId:'new'}));
 assert.equal(env.ctx.rawPositions.alice.connectionId,'new',
  'reconnect may start a fresh sequence');
 env.emit('child_removed','alice',{});
 assert(!('alice' in env.ctx.positions),'disconnected ghost must disappear');
 assert(!env.ctx.remotePositionReceivedAt.has('alice'));
 assert.equal(env.ctx.quietCanvasPoseRevision,1,
  'KO quiet scene wakes after remote player disappears');
 assert(env.ctx.presentationMetrics.positionSnapshots>0&&env.ctx.workTiming.positionSnapshots>0);
 assert(env.ctx.workTiming.positionSnapshotTotalMs>0);
 const result=JSON.stringify(env.ctx.window.__brawlPositionV44QA());
 assert(!result.includes('alice')&&!result.includes('match'),'metrics must never expose IDs');
 const old=mk({});
 old.emit('child_added','zeta',pos(2));
 old.ctx.room={};old.ctx.roomGeneration=2;
 old.initial.yes({val:()=>({zeta:pos(1)})});
 await flush();
 assert.equal(old.ctx.positionsReady,false,'old generation async bootstrap ignored');
 assert.equal(old.ctx.reconciles,0);
 // No positions at all must still allow round setup to progress when initial
 // empty snapshot is returned (same as old positions value listener).
 const empty=mk({});empty.initial.yes({val:()=>null});await flush();
 assert.equal(empty.ctx.positionsReady,true);
 assert.equal(empty.ctx.reconciles,1);
 console.log('PASS V4.4 2v2 incremental positions, bootstrap race, stale seq, reconnect, remove ghost, generation guard, no writes, 4-mode isolation');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
