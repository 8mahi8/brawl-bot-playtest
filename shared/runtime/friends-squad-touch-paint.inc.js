function recordFirstTouchCanvasPaint(paintedAt){
 const shot=inputTiming.lastTouchShot;
 if(!shot?.submitted||!Number.isFinite(shot.handlerEnteredAt)||shot.canvasDrawSubmittedMs!==null)return;
 shot.canvasDrawSubmittedMs=Math.max(0,Math.round((paintedAt-shot.handlerEnteredAt)*10)/10);
}
