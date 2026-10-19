  function bindUltimateButton(){
    const el=$('ultBtn');
    let suppressClickUntil=0;
    el.addEventListener('pointerdown',e=>{
      if(startButtonDrag(e,'ult'))return;
      if(el.disabled||!isPlaying()||botPilot)return;
      e.preventDefault();e.stopPropagation();
      suppressClickUntil=performance.now()+700;
      ultAim={id:e.pointerId,ox:e.clientX,oy:e.clientY,x:e.clientX,y:e.clientY,dragged:false,cancelled:false};
      try{el.setPointerCapture(e.pointerId);}catch(_e){}
    },{passive:false});
    el.addEventListener('pointermove',e=>{moveButtonDrag(e);pointerMove(e);});
    el.addEventListener('pointerup',e=>{stopButtonDrag(e);pointerUp(e);});
    el.addEventListener('pointercancel',e=>{stopButtonDrag(e);pointerUp(e);});
    el.addEventListener('click',e=>{if(layoutEditing){e.preventDefault();return;}if(performance.now()<suppressClickUntil){e.preventDefault();return;} if(!ultAim)shoot(true);});
  }
  function bindActionButton(id,handler) {
    const el=$(id);
    let suppressClickUntil=0;
    el.addEventListener('pointerdown',e=>{
      if(startButtonDrag(e,'gadget'))return;
      if(e.pointerType==='mouse'||el.disabled)return;
      e.preventDefault();e.stopPropagation();
      suppressClickUntil=performance.now()+800;
      handler();
    },{passive:false});
    el.addEventListener('pointermove',moveButtonDrag);
    el.addEventListener('pointerup',stopButtonDrag);
    el.addEventListener('pointercancel',stopButtonDrag);
    el.addEventListener('click',e=>{
      if(layoutEditing){e.preventDefault();return;}
      if(performance.now()<suppressClickUntil){e.preventDefault();return;}
      handler();
    });
  }
  // --- Offline practice and optional online phone BOT. No bot network writes in solo mode. ---
