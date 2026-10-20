// V4.4 staging-only position subscriptions. No change to RTDB writes,
// room format, simulation authority or public Google Sites HTML.
// One initial value read establishes positionsReady; after that subscribe to
// child changes so each update handles only the affected player's entry.
const squadPositionDeltaV44={
 bootstrapCalls:0,bootstrapKeys:0,added:0,changed:0,removed:0,
 staleDropped:0,updatesApplied:0
};
function squadPositionSameGeneration(a,b){
 return !!a&&!!b&&a.connectionId===b.connectionId&&
  a.matchId===b.matchId&&a.round===b.round&&
  a.motionRev===b.motionRev&&a.life===b.life;
}
function squadPositionMerge(id,p){
 if(!id||!p||typeof p!=='object'||Array.isArray(p))return false;
 const prev=rawPositions[id];
 if(squadPositionSameGeneration(prev,p)&&Number.isSafeInteger(prev.seq)&&
    Number.isSafeInteger(p.seq)&&p.seq<=prev.seq){
  squadPositionDeltaV44.staleDropped++;
  return false;
 }
 rawPositions[id]=p;squadPositionDeltaV44.updatesApplied++;
 return true;
}
function squadPositionDeltaMeasured(fn){
 const began=performance.now();
 presentationMetrics.positionSnapshots++;
 workTiming.positionSnapshots++;
 try{return fn();}
 finally{workTiming.positionSnapshotTotalMs+=performance.now()-began;}
}
function subscribeSquadPositionDeltas(ref,activeRoom,generation){
 let primed=false;
 const touched=new Set();
 const current=()=>room===activeRoom&&roomGeneration===generation;
 const upsert=(snap,kind)=>squadPositionDeltaMeasured(()=>{
  if(!current()||!snap.key)return;
  if(!primed)touched.add(snap.key);
  squadPositionDeltaV44[kind]++;
  if(!squadPositionMerge(snap.key,snap.val()))return;
  if(positionsReady){
   ingestPositions(snap.key);reconcileRoomView('positions');
  }
 });
 watch(ref,'child_added',snap=>upsert(snap,'added'));
 watch(ref,'child_changed',snap=>upsert(snap,'changed'));
 watch(ref,'child_removed',snap=>squadPositionDeltaMeasured(()=>{
  if(!current()||!snap.key)return;
  if(!primed)touched.add(snap.key);
  squadPositionDeltaV44.removed++;
  delete rawPositions[snap.key];
  if(positions[snap.key]){
   delete positions[snap.key];
   remotePositionReceivedAt.delete(snap.key);
   if(snap.key!==myId)quietCanvasPoseRevision++;
  }
  if(positionsReady)reconcileRoomView('positions');
 }));
 // Subscribe BEFORE priming. A player moving during the one-time read must
 // not be overwritten by its older initial snapshot or resurrected after a
 // child_removed event. The touched set captures that initialization race.
 ref.once('value').then(snap=>{
  if(!current())return;
  squadPositionDeltaV44.bootstrapCalls++;
  const initial=snap.val()||{};
  for(const [id,p]of Object.entries(initial)){
   if(touched.has(id))continue;
   squadPositionDeltaV44.bootstrapKeys++;
   squadPositionMerge(id,p);
  }
  primed=true;touched.clear();
  positionsReady=true;
  ingestPositions();reconcileRoomView('positions');
 }).catch(e=>{if(current())status('位置情報の初回取得に失敗：'+errorText(e));});
}
window.__brawlPositionV44QA=()=>Object.freeze({...squadPositionDeltaV44,
 positionsReady});
// The counters are local-only: no player IDs, room IDs or network reports.
