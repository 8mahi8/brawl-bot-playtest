// BRAWL 2vs2 normal/draft shared host actions, combat ticks and position sync.
// Generated into standalone staging HTML; no extra requests or Firebase writes.
/* BEGIN SHARED SQUAD processCombatTick */
async function processCombatTick(){
 combatTickCalls++;
 if(combatBusy||hostProcessing){combatTickSkips.busy++;return;}
 if(hostQueue.length){combatTickSkips.queue++;return;}
 if(!isAuthoritative()||!combatReady()||game.hostToken!==myConnection){combatTickSkips.scope++;return;}
 const now=serverNow();
 const age=now-game.clock?.wallAt;
 if(!Number.isFinite(game.clock?.wallAt)||age<50){combatTickSkips.clock++;return;}
 // Defer only the quiet KO clock step. New shots still dispatch immediately.
 if(quietKoTickSafe(game,age)&&age<QUIET_KO_WRITE_AGE_MS){
  quietTickMetrics.deferrals++;return;
 }
 combatBusy=true;
 const activeRoom=room,rev=game.combatRev,token=myConnection,match=game.matchId,round=game.round;
 const began=performance.now();tickTxnTiming.starts++;
 try{
  const snapshotAt=performance.now(),input=inputSnapshot();
  sampleTickTxn('snapshotMs',performance.now()-snapshotAt);
  combatTickResults.writes++;
  let task;const transactionAt=performance.now();
  try{task=activeRoom.child('game').transaction(g=>{
   const updaterAt=performance.now();tickTxnTiming.updaterCalls++;
   try{
    if(!g){combatTickResults.missing++;return;}
    if(g.hostToken!==token){combatTickResults.wrongHost++;return;}
    if(g.matchId!==match||g.round!==round){combatTickResults.wrongMatch++;return;}
    if(g.combatRev!==rev){combatTickResults.wrongRev++;return;}
    const step=(state,at,expected)=>{
     const engineAt=performance.now();tickTxnTiming.engineCalls++;
     try{return engine(state).step(state,input,at,expected,token);}
     finally{sampleTickTxn('engineMs',performance.now()-engineAt);}
    };
    // Re-check the Firebase updater state in case a received action changed
    // projectiles, scheduled abilities or other combat state since our cache.
    if(quietKoTickSafe(g,now-g.clock.wallAt)&&now-g.clock.wallAt>=QUIET_KO_WRITE_AGE_MS){
     const middle=step(g,now-100,rev);
     if(middle!==g){
      const end=step(middle,now,middle.combatRev);
      if(end!==middle){quietTickMetrics.doubleSteps++;return end;}
      return middle;
     }
    }else if(quietKoTickSafe(game,age))quietTickMetrics.unsafeAtCommit++;
    const n=step(g,now,rev);
    if(n===g){combatTickResults.noStep++;return;}
    quietTickMetrics.ordinarySteps++;
    return n;
   }finally{sampleTickTxn('updaterMs',performance.now()-updaterAt);}
  },undefined,false);}
  finally{sampleTickTxn('callMs',performance.now()-transactionAt);}
  const tr=await task;
  if(tr.committed){combatTickResults.committed++;tickTxnTiming.committed++;}
  else tickTxnTiming.rejected++;
 }catch(e){tickTxnTiming.errors++;combatTickResults.error++;combatTickLastError=String(e?.stack||e);console.warn('Combat tick',e);}
 finally{
  tickTxnTiming.elapsedMs+=performance.now()-began;
  combatBusy=false;
  if(room===activeRoom&&hostQueue.length)scheduleHostActionDispatch();
 }
}
/* END SHARED SQUAD processCombatTick */

/* BEGIN SHARED SQUAD processHostQueue */
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
/* END SHARED SQUAD processHostQueue */

/* BEGIN SHARED SQUAD drainActions */
function drainActions(){const now=serverNow();
 if(!clockReady)return;
 for(const [id,p]of pendingActions)if(p.action.at<now-ACTION_TTL||p.action.at>now+ACTION_FUTURE||failedLocalActions.has(id)){pendingActions.delete(id);clientBullets=clientBullets.filter(b=>!b.id.startsWith(id+':'));}
 if(!lobbyReady||!gameReady||!presenceReady||!positionsReady||!game||game.matchId!==lobby?.matchId||roundResetKey!==game.matchId+':'+game.round||pageSuspended)return;
 const sorted=[...pendingActions.values()].sort((p,q)=>p.action.owner.localeCompare(q.action.owner)||p.action.seq-q.action.seq);
 for(const p of sorted){const a=p.action,id=a.eventId;
  if(a.matchId!==game.matchId||a.round!==game.round||!playerSeat(a.owner))continue;
  const receipt=game.usedActions?.[id];
  if(validActionReceipt(a,receipt)){
   boundedRemember(seenActions,id);clientBullets=clientBullets.filter(b=>!b.id.startsWith(id+':'));
   pendingActions.delete(id);continue;
  }

  // Firebase child_added can be a local echo before set() is accepted.
  if(p.networkSeen&&!localPendingWrites.has(id)&&!receipt&&a.seq>(game.stats?.[a.owner]?.lastActionSeq||0)&&isAuthoritative()&&game.phase==='playing'&&!paused&&!queuedActions.has(id)){
   boundedRemember(queuedActions,id);hostQueue.push(a);
  }
 }
 scheduleHostActionDispatch();
}
/* END SHARED SQUAD drainActions */

/* BEGIN SHARED SQUAD submitAction */
function submitAction(action,errorPrefix){const roomKey=room.key,owner=myId,ref=room.child('actions').push(),a={...action,eventId:ref.key};
 localPendingWrites.add(a.eventId);acceptAction(a,true);
 ref.set(action).then(()=>{
  localPendingWrites.delete(a.eventId);
  if(room?.key===roomKey&&myId===owner)acceptAction(a);
 }).catch(e=>{
  localPendingWrites.delete(a.eventId);boundedRemember(failedLocalActions,a.eventId);
  if(room?.key!==roomKey||myId!==owner)return;
  pendingActions.delete(a.eventId);
  clientBullets=clientBullets.filter(b=>!b.id.startsWith(a.eventId+':'));hostQueue=hostQueue.filter(q=>q.eventId!==a.eventId);
  status(errorPrefix+errorText(e));
 });
}
/* END SHARED SQUAD submitAction */

/* BEGIN SHARED SQUAD scheduleHostActionDispatch */
function scheduleHostActionDispatch(){
  if(hostActionDispatchQueued||hostProcessing||!hostQueue.length||!isAuthoritative()||!combatReady())return;
  hostActionDispatchQueued=true;
  const activeRoom=room,matchId=game.matchId,round=game.round;
  queueMicrotask(()=>{
   hostActionDispatchQueued=false;
   if(room!==activeRoom||game?.matchId!==matchId||game?.round!==round||!combatReady()||!isAuthoritative()||!hostQueue.length)return;
   processHostQueue().catch(e=>console.warn('Fast host action dispatch',e));
  });
 }
/* END SHARED SQUAD scheduleHostActionDispatch */

/* BEGIN SHARED SQUAD acceptAction */
function acceptAction(a,localPrediction=false){if(!validActionRequest(a)||failedLocalActions.has(a.eventId))return;
 const old=pendingActions.get(a.eventId);if(old&&!['owner','matchId','round','seq','type','x','y','angle','at','life','connectionId','reach'].every(k=>old.action[k]===a[k]))return;
 pendingActions.set(a.eventId,{action:a,networkSeen:!!old?.networkSeen||!localPrediction});
 observeShotAction(a,localPrediction);
 if(pendingActions.size>ACTION_LIMIT)pendingActions.delete(pendingActions.keys().next().value);
 if(localPrediction&&a.owner===myId&&a.type==='shot'&&!predictedActions.has(a.eventId)){
  boundedRemember(predictedActions,a.eventId);clientBullets.push(...bulletSpecs(a,game?.stats?.[a.owner]?.char));
 }
 drainActions();
}
/* END SHARED SQUAD acceptAction */

/* BEGIN SHARED SQUAD positionPublishDue */
function positionPublishDue(previous,next,elapsedMs){
 if(!previous||previous.connectionId!==next.connectionId||previous.matchId!==next.matchId||
    previous.round!==next.round||previous.motionRev!==next.motionRev||previous.life!==next.life)return true;
 if(elapsedMs<POSITION_ACTIVE_INTERVAL_MS)return false;
 if(elapsedMs>=POSITION_IDLE_HEARTBEAT_MS)return true;
 const moving=Math.hypot(next.vx||0,next.vy||0)>4||Math.hypot(previous.vx||0,previous.vy||0)>4;
 const turned=Math.abs(Math.atan2(Math.sin(next.a-previous.a),Math.cos(next.a-previous.a)))>.04;
 return moving||turned||Math.hypot(next.x-previous.x,next.y-previous.y)>.4;
}
/* END SHARED SQUAD positionPublishDue */

/* BEGIN SHARED SQUAD sendPositionNow */
function sendPositionNow(){if(!room||!myId||!game)return;
 const payload={x:Math.round(local.x),y:Math.round(local.y),vx:0,vy:0,a:local.a,seq:++sendSeq,connectionId:myConnection,matchId:game.matchId,round:game.round,motionRev:appliedMotionRev,life:game.stats[myId].life};
 lastSentPose=payload;lastSend=performance.now();presentationMetrics.positionWrites++;
 room.child('positions/'+myId).set(payload).catch(()=>{});
}
/* END SHARED SQUAD sendPositionNow */

/* BEGIN SHARED SQUAD ingestPositions */
function ingestPositions(){if(!game)return;
 const scope=game.matchId+':'+game.round;if(positionScope!==scope){positions={};positionScope=scope;remotePositionReceivedAt.clear();}
 for(const [id,p]of Object.entries(rawPositions)){
  if(!playerSeat(id)||!validPosition(p)||p.motionRev!==(game.motions?.[id]?.rev||0)||p.life!==(game.stats?.[id]?.life||0))continue;
  const prior=positions[id];
  if(prior&&prior.connectionId===p.connectionId&&prior.life===p.life&&prior.motionRev===p.motionRev&&p.seq<=prior.seq)continue;
  if(p.connectionId&&!presence[id]?.[p.connectionId])continue;
  // A stopped remote may receive a position/heading correction with zero velocity.
  // Wake the quiet KO Canvas once for visual changes, not for sequence-only heartbeats.
  if(id!==myId&&(!prior||prior.x!==p.x||prior.y!==p.y||prior.a!==p.a||
    prior.motionRev!==p.motionRev||prior.life!==p.life||prior.connectionId!==p.connectionId))quietCanvasPoseRevision++;
  positions[id]={...p};
  remotePositionReceivedAt.set(id,performance.now());
 }
}
/* END SHARED SQUAD ingestPositions */

/* BEGIN SHARED SQUAD remotePresentationTarget */
function remotePresentationTarget(net,receivedAt,now,obstacles){
  if(!net||!Number.isFinite(net.x)||!Number.isFinite(net.y))return net;
  if(!Number.isFinite(receivedAt)||!Number.isFinite(now)||!Number.isFinite(net.vx)||!Number.isFinite(net.vy))return net;
  const age=Math.min(REMOTE_VISUAL_EXTRAPOLATE_MS,Math.max(0,now-receivedAt))/1000;
  if(age<=0)return net;
  // Bound impossible velocity spikes, and reject prediction into walls.
  const vx=clamp(net.vx,-260,260),vy=clamp(net.vy,-260,260);
  const x=clamp(net.x+vx*age,R,W-R),y=clamp(net.y+vy*age,R,H-R);
  const hitsWall=(px,py)=>obstacles.some(w=>px+R>w.x&&px-R<w.x+w.w&&py+R>w.y&&py-R<w.y+w.h);
  const px=hitsWall(x,net.y)?net.x:x;
  const py=hitsWall(px,y)?net.y:y;
  return {...net,x:px,y:py};
 }
/* END SHARED SQUAD remotePresentationTarget */

/* BEGIN SHARED SQUAD reconcileHpPreviews */
function reconcileHpPreviews(previous,next){
 if(!previous||!next||next.phase!=='playing'||previous.matchId!==next.matchId||previous.round!==next.round){
  hpPreviewHits=[];return;
 }
 pruneHpPreviews();
 for(const victim of new Set(hpPreviewHits.map(p=>p.victim))){
  const oldHP=previous.hp?.[victim],newHP=next.hp?.[victim];
  if(!Number.isFinite(oldHP)||!Number.isFinite(newHP))continue;
  if(newHP>oldHP||newHP<=0){hpPreviewHits=hpPreviewHits.filter(p=>p.victim!==victim);continue;}
  let delta=Math.max(0,oldHP-newHP);
  for(const p of hpPreviewHits){
   if(p.victim!==victim||delta<=0)continue;
   const consumed=Math.min(p.amount,delta);p.amount-=consumed;delta-=consumed;
  }
 }
 hpPreviewHits=hpPreviewHits.filter(p=>p.amount>.01);
}
/* END SHARED SQUAD reconcileHpPreviews */

/* BEGIN SHARED SQUAD previewOwnBulletHit */
function previewOwnBulletHit(b,victim,damage){
 if(solo||botPilot||!game||game.phase!=='playing'||paused||
    b.owner!==myId||!victim||!game?.stats?.[victim]||!Number.isFinite(damage)||damage<=0)return;
 if(!(game.hp?.[victim]>1)||!canSeeEnemy(targetPoint(victim),victim))return;
 pruneHpPreviews();
 if(hpPreviewHits.some(p=>p.id===b.id))return;
 const pending=hpPreviewHits.filter(p=>p.victim===victim).reduce((a,p)=>a+p.amount,0);
 const amount=Math.min(damage,Math.max(0,game.hp[victim]-pending-1));
 if(amount<=0)return;
 hpPreviewHits.push({id:b.id,victim,amount,at:performance.now(),matchId:game.matchId,round:game.round,life:game.stats[victim].life});
 if(hpPreviewHits.length>36)hpPreviewHits.shift();
 renderGameHUD();
}
/* END SHARED SQUAD previewOwnBulletHit */

/* BEGIN SHARED SQUAD renderCombatEvents */
function renderCombatEvents(){for(const [id,e] of Object.entries(game?.events||{})){
 if(seenEffects.has(id))continue;boundedRemember(seenEffects,id);if(combatNow()-e.at>350)continue;
 if(e.type==='hit'&&e.owner===myId)hitConfirmUntil=performance.now()+180;
 fx.push({...e,type:e.type==='jump'?'impact':e.type,t:.35});
}}
/* END SHARED SQUAD renderCombatEvents */
