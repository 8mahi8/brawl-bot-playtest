// Pure bullet physics shared by 1vs1 legacy shooting and both BrawlCombatV8 reducers.
// No global DOM, no state writes, no Firebase access. Included in both generated standalone HTML builds.
const BrawlProjectileV1=Object.freeze({
 hitCircle(x,y,targetX,targetY,totalRadius){
  return Math.hypot(targetX-x,targetY-y)<=totalRadius;
 },
 damage(b,tankFalloff){
  if(b.char==='tank'&&!b.ult)return tankFalloff(b.dist);
  if(!b.ult&&(b.char==='sniper'||b.sniper))return Math.min(64,36+Math.round(b.dist*.065));
  return b.damage;
 },
 advance(b,dtSeconds,{width,height,wallHit,targetHit,rangeFirst=true}){
  if(!Number.isFinite(dtSeconds)||dtSeconds<0)throw Error('Invalid projectile delta time');
  const distance=Math.hypot(b.vx,b.vy)*dtSeconds;
  // Substep granularity prevents tunneling through walls and actors between ticks.
  const steps=Math.max(1,Math.ceil(distance/6)),dx=b.vx*dtSeconds/steps,dy=b.vy*dtSeconds/steps,dd=distance/steps;
  for(let i=0;i<steps;i++){
   b.x+=dx;b.y+=dy;b.dist+=dd;
   if(b.x<0||b.x>width||b.y<0||b.y>height||wallHit(b.x,b.y,b.radius))return false;
   if(rangeFirst&&b.dist>=b.range)return false;
   if(targetHit(b))return false;
   if(!rangeFirst&&b.dist>=b.range)return false;
  }
  return true;
 }
});
