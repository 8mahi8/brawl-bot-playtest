function squadRemoteProjectileVisual(b,prev,targetX,targetY,nowMs,weight,selfId){
  // An authoritative snapshot may already contain a bullet 200-350ms into
  // its flight. Rewinding it to the muzzle and easing for another 135ms
  // made delayed remote shots look even later than the network event.
  // Start at the latest extrapolated authoritative position instead.
  // This changes ONLY canvas presentation, never damage, host physics or RTDB.
  if(!prev){
   const speed=Math.hypot(b.vx,b.vy);
   const travelledMs=Number.isFinite(b.dist)&&b.dist>=0&&speed>0
     ? b.dist/speed*1000 : Infinity;
   // Preserve a short, visual-only muzzle flash for genuinely new shots,
   // without moving the bullet backward. Older snapshots need no replay.
   const flash=b.owner!==selfId&&!b.splitChild&&!b.ricochetUsed&&
     travelledMs<=85&&Number.isFinite(b.originX)&&Number.isFinite(b.originY);
   return flash?{x:targetX,y:targetY,originX:b.originX,originY:b.originY,
     bornAt:nowMs,flash:true}:{x:targetX,y:targetY};
  }
  // The early ACTION preview hands its latest position to bulletVisuals;
  // keep normal smoothing for subsequent incremental snapshots.
  const updated={...prev,x:prev.x+(targetX-prev.x)*weight,
    y:prev.y+(targetY-prev.y)*weight};
  if(Number.isFinite(prev.bornAt)&&nowMs-prev.bornAt>=155){
   delete updated.bornAt;
   updated.flash=false;
  }
  return updated;
 }

// V5.3 STAGING EXPERIMENT: move remote authoritative visual bullets for a
// bounded 180ms after the last host clock, rather than freezing after 110ms.
// This only changes Canvas coordinates; no game state, collision, HP, or RTDB.
// Keep bounded to avoid long-lived ghost bullets when snapshots stop arriving.
function squadProjectileVisualAheadSeconds(snapshotAgeMs){
  if(!Number.isFinite(snapshotAgeMs))return 0;
  return Math.min(.18,Math.max(0,snapshotAgeMs/1000));
}
