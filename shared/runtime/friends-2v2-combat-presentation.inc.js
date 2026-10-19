// Shared 2v2 host combat/presentation helpers (source-preserving extraction).
// Original normal/draft candidate HTMLs are immutable. Inject into STAGING only.
/* BEGIN SHARED PRESENTATION processCombatTick */
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
/* END SHARED PRESENTATION processCombatTick */

/* BEGIN SHARED PRESENTATION sendPositionNow */
function sendPositionNow(){if(!room||!myId||!game)return;
 const payload={x:Math.round(local.x),y:Math.round(local.y),vx:0,vy:0,a:local.a,seq:++sendSeq,connectionId:myConnection,matchId:game.matchId,round:game.round,motionRev:appliedMotionRev,life:game.stats[myId].life};
 lastSentPose=payload;lastSend=performance.now();presentationMetrics.positionWrites++;
 room.child('positions/'+myId).set(payload).catch(()=>{});
}
/* END SHARED PRESENTATION sendPositionNow */

/* BEGIN SHARED PRESENTATION remotePresentationTarget */
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
/* END SHARED PRESENTATION remotePresentationTarget */

/* BEGIN SHARED PRESENTATION reconcileHpPreviews */
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
/* END SHARED PRESENTATION reconcileHpPreviews */

/* BEGIN SHARED PRESENTATION previewOwnBulletHit */
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
/* END SHARED PRESENTATION previewOwnBulletHit */

/* BEGIN SHARED PRESENTATION renderCombatEvents */
function renderCombatEvents(){for(const [id,e] of Object.entries(game?.events||{})){
 if(seenEffects.has(id))continue;boundedRemember(seenEffects,id);if(combatNow()-e.at>350)continue;
 if(e.type==='hit'&&e.owner===myId)hitConfirmUntil=performance.now()+180;
 fx.push({...e,type:e.type==='jump'?'impact':e.type,t:.35});
}}
/* END SHARED PRESENTATION renderCombatEvents */
