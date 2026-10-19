  function pcPointer(e){
    if(!isPlaying()||botPilot||layoutEditing||!view.scale)return;
    const rect=canvas.getBoundingClientRect();
    pcAim={x:clamp((e.clientX-rect.left-view.ox)/view.scale,0,W),y:clamp((e.clientY-rect.top-view.oy)/view.scale,0,H)};
  }
  function pcAngle(){return pcAim?Math.atan2(pcAim.y-local.y,pcAim.x-local.x):local.angle;}
  function pcReach(){return pcAim?clamp(Math.hypot(pcAim.x-local.x,pcAim.y-local.y),55,330):330;}