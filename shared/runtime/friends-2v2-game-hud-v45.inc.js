// V4.5: group NORMAL active-play game-state HUD refreshes on the next
// animation frame. Physics, Firebase listeners, action receipts, hit/HP,
// lobby/round/paused banners and all authoritative work still run immediately.
// Original immutable source HTML and published Google Sites remain unchanged.
const v45HudPerf={
 requests:0,queued:0,coalesced:0,immediate:0,flushed:0,invalidated:0,
 lastWaitMs:0,maxWaitMs:0,renderCalls:0,totalRenderMs:0,maxRenderMs:0
};
let v45HudPending=false,v45HudToken=0;
function requestGameHudRefreshV45(urgent=false){
 v45HudPerf.requests++;
 // Do not defer round transitions, entry, paused/disconnected banners,
 // hidden-tab lifecycle, or first frame after an iPad Safari resume.
 if(urgent||document.hidden||pageSuspended||scene!=='game'){
  if(v45HudPending){v45HudPending=false;v45HudToken++;v45HudPerf.invalidated++;}
  v45HudPerf.immediate++;renderGameHUD();return;
 }
 if(v45HudPending){v45HudPerf.coalesced++;return;}
 v45HudPending=true;v45HudPerf.queued++;
 const token=++v45HudToken,activeRoom=room,generation=roomGeneration;
 const queuedAt=performance.now();
 requestAnimationFrame(()=>{
  if(token!==v45HudToken)return;
  v45HudPending=false;
  if(room!==activeRoom||roomGeneration!==generation||scene!=='game'||pageSuspended){
   v45HudPerf.invalidated++;return;
  }
  const waited=performance.now()-queuedAt;
  v45HudPerf.lastWaitMs=Math.round(Math.max(0,waited)*10)/10;
  v45HudPerf.maxWaitMs=Math.max(v45HudPerf.maxWaitMs,waited);
  v45HudPerf.flushed++;
  renderGameHUD();
 });
}
// renderGameHUD's original body has been renamed by the build-only patch.
// Calls from periodicUiRefresh and critical lifecycle paths stay synchronous.
function renderGameHUD(){
 const began=performance.now();
 try{return renderGameHUDV45Base();}
 finally{
  const elapsed=performance.now()-began;
  v45HudPerf.renderCalls++;v45HudPerf.totalRenderMs+=elapsed;
  v45HudPerf.maxRenderMs=Math.max(v45HudPerf.maxRenderMs,elapsed);
 }
}
window.__brawlHudV45QA=()=>Object.freeze({
 requests:v45HudPerf.requests,queued:v45HudPerf.queued,
 coalesced:v45HudPerf.coalesced,immediate:v45HudPerf.immediate,
 flushed:v45HudPerf.flushed,invalidated:v45HudPerf.invalidated,
 lastWaitMs:Math.round(v45HudPerf.lastWaitMs*10)/10,
 maxWaitMs:Math.round(v45HudPerf.maxWaitMs*10)/10,
 renderCalls:v45HudPerf.renderCalls,
 avgHudRenderMs:v45HudPerf.renderCalls?Math.round(
  v45HudPerf.totalRenderMs/v45HudPerf.renderCalls*100)/100:0,
 maxHudRenderMs:Math.round(v45HudPerf.maxRenderMs*100)/100,
 pending:v45HudPending
});
// Read-only anonymous local counters: never transmits anything to Firebase.
