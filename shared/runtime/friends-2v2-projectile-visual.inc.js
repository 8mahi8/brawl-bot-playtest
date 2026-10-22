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

 // Bounds the additional 110–180ms visual segment against nearby solid geometry.
 // Existing <=110ms and own-shot trajectories are deliberately unchanged.
 // Slab intersection avoids stepping through an arbitrary number of pixels.
function squadProjectileSegmentHitsWall(x0,y0,x1,y1,r,w){
 if(!w||!Number.isFinite(w.x)||!Number.isFinite(w.y)||
    !Number.isFinite(w.w)||!Number.isFinite(w.h))return false;
 const left=w.x-r,right=w.x+w.w+r,top=w.y-r,bottom=w.y+w.h+r;
 const dx=x1-x0,dy=y1-y0;
 let enter=0,exit=1;
 if(Math.abs(dx)<1e-9){
  if(x0<left||x0>right)return false;
 }else{
  const a=(left-x0)/dx,b=(right-x0)/dx;
  enter=Math.max(enter,Math.min(a,b));exit=Math.min(exit,Math.max(a,b));
  if(enter>exit)return false;
 }
 if(Math.abs(dy)<1e-9){
  if(y0<top||y0>bottom)return false;
 }else{
  const a=(top-y0)/dy,b=(bottom-y0)/dy;
  enter=Math.max(enter,Math.min(a,b));exit=Math.min(exit,Math.max(a,b));
 }
 return enter<=exit;
}
// Cache the collision preflight by authoritative projectile object.
// Snapshot objects are replaced on RTDB updates, while rAF reads them repeatedly.
// WeakMap avoids leaking dead bullet IDs across rounds.
const squadProjectileGuardMemo=new WeakMap();
function squadProjectileGuardedRemoteAhead(b,baseline,requested,spawnDelay,walls,width,height,portableWalls,at){
 if(requested<=baseline)return requested;
 if(!b||!Number.isFinite(b.x)||!Number.isFinite(b.y)||
    !Number.isFinite(b.vx)||!Number.isFinite(b.vy)||
    !Number.isFinite(baseline)||!Number.isFinite(requested)||
    !Number.isFinite(spawnDelay))return baseline;
 const memo=squadProjectileGuardMemo.get(b);
 if(memo&&memo.baseline===baseline&&memo.spawnDelay===spawnDelay&&
    memo.walls===walls&&memo.portableWalls===portableWalls&&
    memo.width===width&&memo.height===height&&at<memo.validUntil&&
    memo.x===b.x&&memo.y===b.y&&memo.vx===b.vx&&memo.vy===b.vy&&
    memo.dist===b.dist&&memo.range===b.range&&memo.radius===b.radius)
  return memo.allow?requested:baseline;
 // Evaluate the complete 110–180ms segment even on its first frame.
 // Checking only the elapsed fraction can cause a later wall-driven rewind.
 const from=Math.max(0,baseline-spawnDelay),to=Math.max(0,Math.max(requested,.18)-spawnDelay);
 let validUntil=Infinity,allow=true;
 const x0=b.x+b.vx*from,y0=b.y+b.vy*from;
 const x1=b.x+b.vx*to,y1=b.y+b.vy*to;
 const radius=Number.isFinite(b.radius)?Math.max(0,b.radius):4;
 if(!Number.isFinite(x0)||!Number.isFinite(y0)||!Number.isFinite(x1)||
    !Number.isFinite(y1)||!Number.isFinite(width)||!Number.isFinite(height)||
    x1<radius||x1>width-radius||y1<radius||y1>height-radius)allow=false;
 const speed=Math.hypot(b.vx,b.vy);
 if(allow&&Number.isFinite(b.range)&&Number.isFinite(b.dist)&&
    b.dist+speed*to>=b.range)allow=false;
 if(allow&&to>from)for(const wall of walls||[]){
  if(squadProjectileSegmentHitsWall(x0,y0,x1,y1,radius,wall)){
   allow=false;break;
  }
 }
 // A portable wall can activate or expire between two rAF frames even
 // without a new RTDB snapshot. Expire memo at its next time transition.
 if(portableWalls)for(const key in portableWalls){
  if(!Object.prototype.hasOwnProperty.call(portableWalls,key))continue;
  const wall=portableWalls[key];
  if(wall?.kind!=='portable_wall')continue;
  if(wall.start>at&&wall.start<validUntil)validUntil=wall.start;
  else if(wall.until>at&&wall.until<validUntil)validUntil=wall.until;
  if(allow&&wall.start<=at&&wall.until>at&&to>from&&
     squadProjectileSegmentHitsWall(x0,y0,x1,y1,radius,wall))allow=false;
 }
 squadProjectileGuardMemo.set(b,{baseline,spawnDelay,walls,portableWalls,
  width,height,validUntil,allow,x:b.x,y:b.y,vx:b.vx,vy:b.vy,
  dist:b.dist,range:b.range,radius:b.radius});
 return allow?requested:baseline;
}
