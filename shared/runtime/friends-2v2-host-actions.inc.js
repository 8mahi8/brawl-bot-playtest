async function processHostQueue(){
 if(!combatReady()||!isAuthoritative()||hostProcessing||combatBusy||!hostQueue.length||game.hostToken!==myConnection)return;
 const activeRoom=room,match=game.matchId,round=game.round,token=myConnection;
 let activeBatch=[],deferredRetry=false;hostProcessing=true;
 // The pending map is the source of truth for a retry. In particular, if the
 // first six of seven shots abort, the seventh must NOT overtake them.
 function rebuildOnNextPoll(){
  if(room!==activeRoom||game?.matchId!==match||game?.round!==round||myConnection!==token)return;
  hostQueue=[];
  queuedActions.clear();
 }
 try{
  while(hostQueue.length&&combatReady()&&room===activeRoom&&game?.matchId===match&&game?.round===round&&myConnection===token){
   const now=serverNow();
   activeBatch=hostQueue.splice(0,HOST_ACTION_BATCH_LIMIT).filter(a=>
    validActionRequest(a)&&a.matchId===match&&a.round===round&&
    !!presence[a.owner]?.[a.connectionId]&&a.at>=now-ACTION_TTL&&a.at<=now+ACTION_FUTURE);
   if(!activeBatch.length)continue;
   const input=inputSnapshot();
   const result=await activeRoom.child('game').transaction(g=>{
    if(!g||g.hostToken!==token||g.matchId!==match||g.round!==round||g.phase!=='playing')return;
    let next=g;
    // A new shot can interrupt the deferred idle KO update. Catch up the
    // first event-free slice BEFORE accepting it, preserving reload/clock.
    const sinceTick=now-g.clock?.wallAt;
    if(quietKoTickSafe(g,sinceTick)&&sinceTick>=150){
     const caughtUp=engine(g).step(g,input,now-100,g.combatRev,token);
     if(caughtUp!==g){next=caughtUp;quietTickMetrics.actionCatchups++;}
    }
    for(const a of activeBatch)next=engine(next).accept(next,a,input,now);
    // A received shot normally waits for a second Firebase round trip before
    // any bullet/HP physics can advance. If >=50ms elapsed, step in THIS SAME
    // authoritative transaction. The shared engine still determines all hits.
    if(next?.phase==='playing'&&now-next.clock?.wallAt>=50){
     next=engine(next).step(next,input,now,next.combatRev,token);
    }
    return next===g?undefined:next;
   },undefined,false);
   if(!result.committed){
    // Firebase may abort without throwing. Rebuild the whole ordered queue
    // on the next poll instead of letting later shots overtake the first batch.
    rebuildOnNextPoll();
    activeBatch=[];
    deferredRetry=true;
    break;
   }
   activeBatch=[];
  }
 }catch(e){
  // Rebuild the full ordered queue after an exception as well.
  rebuildOnNextPoll();
  console.warn('Host action batch',e);
 }finally{
  hostProcessing=false;
  // The 100ms timer is still a fallback; avoid losing new actions enqueued
  // while the previous transaction was in flight.
  if(!deferredRetry&&room===activeRoom&&hostQueue.length)scheduleHostActionDispatch();
 }
}

