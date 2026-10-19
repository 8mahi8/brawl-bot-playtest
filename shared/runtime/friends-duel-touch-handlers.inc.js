  function pointerDown(e) {
    if(e.pointerType==='mouse')return;
    if(layoutEditing||!isPlaying()||botPilot)return;
    e.preventDefault();
    const rect=canvas.getBoundingClientRect();
    const x=e.clientX-rect.left,y=e.clientY-rect.top;
    const j=x<rect.width/2?left:right;
    // Recover if iOS Safari has left an old touch id after an interrupted gesture.
    // A fresh touch in the movement half always becomes the active movement touch.
    if(j.id!==null&&j===right)return;
    if(j.id!==null&&j===left){try{canvas.releasePointerCapture(j.id);}catch(_e){}}
    j.id=e.pointerId;j.ox=j.x=x;j.oy=j.y=y;
    if(j===right){normalAimCancelled=false;normalAimEverDragged=false;}
    try{canvas.setPointerCapture(e.pointerId);}catch(_e){}
  }
  function pointerMove(e){
    const rect=canvas.getBoundingClientRect();
    for(const j of [left,right])if(j.id===e.pointerId){
      j.x=e.clientX-rect.left;j.y=e.clientY-rect.top;
      if(j===right){
        const dist=Math.hypot(j.x-j.ox,j.y-j.oy);
        if(dist>28)normalAimEverDragged=true;
        normalAimCancelled=normalAimEverDragged&&dist<20;
      }
    }
    if(ultAim&&ultAim.id===e.pointerId){
      ultAim.x=e.clientX;ultAim.y=e.clientY;
      const dist=Math.hypot(ultAim.x-ultAim.ox,ultAim.y-ultAim.oy);
      if(dist>34)ultAim.dragged=true;
      ultAim.cancelled=ultAim.dragged&&dist<20;
    }
  }
  function pointerUp(e){
    if(left.id===e.pointerId)left.id=null;
    if(right.id===e.pointerId){
      const dx=right.x-right.ox,dy=right.y-right.oy;
      const dist=Math.hypot(dx,dy);
      const cancel=normalAimCancelled||normalAimEverDragged&&dist<20;
      const wasDragged=normalAimEverDragged||dist>28;
      right.id=null;
      normalAimCancelled=false;normalAimEverDragged=false;
      if(e.type!=='pointercancel'&&!cancel){
        if(wasDragged)local.angle=Math.atan2(dy,dx);
        shoot(false,wasDragged?Math.atan2(dy,dx):null,wasDragged?Math.min(BALANCE.bomberRange,aimReach(dist)):null);
      }
    }
    if(ultAim&&ultAim.id===e.pointerId){
      const u=ultAim;
      const dx=u.x-u.ox,dy=u.y-u.oy;
      const d=Math.hypot(dx,dy);
      const cancel=u.cancelled||(u.dragged&&d<20);
      ultAim=null;
      if(e.type!=='pointercancel'&&!cancel)
        shoot(true,u.dragged||d>23?Math.atan2(dy,dx):null,u.dragged||d>23?aimReach(d):null);
    }
  }
  // On iPad, act directly on a touch/pencil pointerdown instead of waiting for click.
  // A synthetic click after pointerdown is suppressed to prevent double-usage.
