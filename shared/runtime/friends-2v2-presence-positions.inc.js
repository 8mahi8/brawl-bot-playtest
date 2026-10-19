async function registerPresence(){if(!room||!myId||!connected||pageSuspended)return;
 if(presenceTask){try{await presenceTask;}catch(_){}return registerPresence();}
 const activeRoom=room,pid=myId,generation=roomGeneration,epoch=connectionEpoch;
 // Reuse the connection path while the SDK stays connected (e.g. BFCache).
 const cid=myConnection||sessionId(),r=activeRoom.child('presence/'+pid+'/'+cid);myConnection=cid;
 const task=(async()=>{
  await r.onDisconnect().remove();
  if(room!==activeRoom||myId!==pid||roomGeneration!==generation||connectionEpoch!==epoch||!connected||pageSuspended||myConnection!==cid)return;
  await r.set({since:serverStamp()});
  if(room!==activeRoom||roomGeneration!==generation||connectionEpoch!==epoch||myConnection!==cid||pageSuspended||!connected){await r.remove();}
 })();presenceTask=task;
 try{await task;}finally{if(presenceTask===task)presenceTask=null;}
}
function validPosition(p){return !!p&&p.matchId===game?.matchId&&p.round===game?.round&&Number.isSafeInteger(p.seq)&&p.seq>=0&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&Number.isFinite(p.a)&&p.x>=R&&p.x<=W-R&&p.y>=R&&p.y<=H-R&&Number.isSafeInteger(p.motionRev)&&Number.isSafeInteger(p.life);}
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
