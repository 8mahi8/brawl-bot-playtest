function pcPointer(e){if(scene!=='game'||botPilot||!view.scale)return;pcCursor=getStagePos(e);pcAim=viewCoords(pcCursor);pcAim.x=clamp(pcAim.x,0,W);pcAim.y=clamp(pcAim.y,0,H);}
function pcAngle(){return pcAim?Math.atan2(pcAim.y-local.y,pcAim.x-local.x):local.a;}
function pcReach(){return pcAim?clamp(Math.hypot(pcAim.x-local.x,pcAim.y-local.y),55,330):310;}
