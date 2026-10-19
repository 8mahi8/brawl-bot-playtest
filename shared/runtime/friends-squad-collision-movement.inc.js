function moveWithWall(dx,dy){const nx=clamp(local.x+dx,R,W-R),ny=clamp(local.y+dy,R,H-R);
 if(!touchingWall(nx,local.y))local.x=nx;if(!touchingWall(local.x,ny))local.y=ny;}
// Recover foreground movement lost to rAF stalls without jumping through
// thin walls. Keep segments smaller than half the actor collision radius.
function moveWithWallSubsteps(dx,dy){
 const steps=Math.max(1,Math.ceil(Math.max(Math.abs(dx),Math.abs(dy))/Math.max(8,R*.45)));
 for(let i=0;i<steps;i++)moveWithWall(dx/steps,dy/steps);
}
