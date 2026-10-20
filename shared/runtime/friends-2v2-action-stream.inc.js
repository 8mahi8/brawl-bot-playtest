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
function actionReceipt(a,acceptedAt){return {owner:a.owner,seq:a.seq,type:a.type,at:a.at,acceptedAt};}
function validActionReceipt(a,r){return !!r&&typeof r==='object'&&r.owner===a.owner&&r.seq===a.seq&&r.type===a.type&&r.at===a.at&&Number.isFinite(r.acceptedAt)&&a.at<=r.acceptedAt+ACTION_FUTURE&&a.at>=r.acceptedAt-ACTION_TTL;}
// Dispatch server-confirmed shots without the extra wait for the 100ms host poll.
 // Coalesce short bursts into one microtask; authoritative collision remains unchanged.
 let hostActionDispatchQueued=false;
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
 function drainActions(){const now=serverNow();
 if(!clockReady)return;
 // Position snapshots can trigger reconciliation tens of times per second.
 // When there are no actions, skip the entire pending-action scan/sort. Keep
 // dispatching any already-enqueued host batch through its normal safety gate.
 if(!pendingActions.size){scheduleHostActionDispatch();return;}
 for(const [id,p]of pendingActions)if(p.action.at<now-ACTION_TTL||p.action.at>now+ACTION_FUTURE||failedLocalActions.has(id)){pendingActions.delete(id);clientBullets=clientBullets.filter(b=>!b.id.startsWith(id+':'));}
 if(!lobbyReady||!gameReady||!presenceReady||!positionsReady||!game||game.matchId!==lobby?.matchId||roundResetKey!==game.matchId+':'+game.round||pageSuspended)return;
 // Only the authoritative host requires deterministic cross-player ordering.
 // Guests only retire their own receipt entries, so copying/sorting every
 // pending action on every position/game callback burns iPad CPU for no gain.
 const sorted=isAuthoritative()?
  [...pendingActions.values()].sort((p,q)=>p.action.owner.localeCompare(q.action.owner)||p.action.seq-q.action.seq):
  pendingActions.values();
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

