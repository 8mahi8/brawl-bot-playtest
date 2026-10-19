canvas.addEventListener('pointerdown',e=>{if(e.pointerType==='mouse')return;if(botPilot||!combatReady()||!alive(myId))return;const p=getStagePos(e);e.preventDefault();if(p.x>canvas.getBoundingClientRect().width/2){if(aimPointer){try{canvas.releasePointerCapture(aimPointer.id);}catch(_e){}}aimPointer={id:e.pointerId,ox:p.x,oy:p.y,x:p.x,y:p.y,dragged:false,downAt:performance.now(),downQueueMs:inputEventQueueDelay(e)};}else{if(pointer){try{canvas.releasePointerCapture(pointer.id);}catch(_e){}}pointer={id:e.pointerId,ox:p.x,oy:p.y,x:p.x,y:p.y};}canvas.setPointerCapture?.(e.pointerId);});
canvas.addEventListener('pointermove',e=>{const p=getStagePos(e);if(pointer?.id===e.pointerId){pointer.x=p.x;pointer.y=p.y;}if(aimPointer?.id===e.pointerId){aimPointer.x=p.x;aimPointer.y=p.y;if(Math.hypot(p.x-aimPointer.ox,p.y-aimPointer.oy)>28)aimPointer.dragged=true;}});
function endPointer(e){const handlerEntered=performance.now();if(pointer?.id===e.pointerId)pointer=null;if(aimPointer?.id===e.pointerId){const a=aimPointer;aimPointer=null;if(e.type==='pointercancel')return;
 const p=getStagePos(e),dx=p.x-a.ox,dy=p.y-a.oy,dist=Math.hypot(dx,dy);
 if(a.dragged&&dist<20)return;
 const manual=a.dragged||dist>28,enemy=manual?null:enemyCandidate();
 const angle=manual?Math.atan2(dy,dx):enemy?Math.atan2(enemy.y-local.y,enemy.x-local.x):local.a;
 const beforeSeq=actionSeq;
 shootAngle(angle,manual?clamp(dist/80*330,55,300):enemy?Math.hypot(enemy.x-local.x,enemy.y-local.y):300);
 // Separate browser event dispatch delay, gesture duration, and actual
 // handler execution time from host/Firebase action acknowledgement.
 inputTiming.lastTouchShot={downQueueMs:a.downQueueMs??null,upQueueMs:inputEventQueueDelay(e,handlerEntered),
  gestureMs:Math.round(handlerEntered-(a.downAt??handlerEntered)),
  handlerMs:Math.round((performance.now()-handlerEntered)*10)/10,
  submitted:actionSeq>beforeSeq,seq:actionSeq,at:Date.now(),handlerEnteredAt:handlerEntered,canvasDrawSubmittedMs:null};
 inputTiming.touchShots++;
}}
canvas.addEventListener('pointerup',endPointer);canvas.addEventListener('pointercancel',endPointer);
canvas.addEventListener('lostpointercapture',e=>{if(pointer?.id===e.pointerId)pointer=null;if(aimPointer?.id===e.pointerId)aimPointer=null;});
