// FPS HUD must reflect actual browser frame pacing, even when safe movement
// simulation clamps a long delta after a busy frame or Safari resume.
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const html=fs.readFileSync(path.join(__dirname,'../online/ipad-squad-v2-lab.html'),'utf8');
const begin=html.indexOf('function frame(now){'),end=html.indexOf('function setLayoutDrag(',begin);
assert(begin>0&&end>begin&&end-begin<2100,'exact live rendering-loop source');
const live=html.slice(begin,end);
function simulate(interval,frames,scene='game'){
 const steps=[],ctx={
  lastFrame:0,fps:60,gadgetToastExpiry:0,fx:[],scene,
  performance:{now:()=>4},document:{hidden:false},
  workTiming:{frameSamples:0,frameGapOver100:0,frameGapMaxMs:0,movementCatchupFrames:0,movementCatchupTotalMs:0,updateTotalMs:0,botTotalMs:0,nonDrawTotalMs:0,nonDrawMaxMs:0},
  drawTiming:{frames:0,totalDrawMs:0,lastDrawMs:0,maxDrawMs:0,skippedCoveredFrames:0},
  clamp:(n,a,b)=>Math.max(a,Math.min(b,n)),adjustCanvasQuality:()=>{},recordFirstTouchCanvasPaint:()=>{},update:(dt,movementDt)=>steps.push({dt,movementDt}),
  updateBots:()=>{},combatReady:()=>false,draw:()=>{},shouldDrawCanvasFrame:()=>scene==='game'||scene==='layout',requestAnimationFrame:()=>{}
 };
 vm.createContext(ctx);
 vm.runInContext(live+'\nthis.tick=frame;',ctx);
 for(let i=0;i<=frames;i++)ctx.tick(1000+i*interval);
 return {fps:ctx.fps,steps,drawTiming:ctx.drawTiming,workTiming:ctx.workTiming};
}
const slow=simulate(120,45);
assert(slow.workTiming.frameGapOver100>=40,'profile genuine 120ms foreground rAF stalls');
assert(slow.fps>8&&slow.fps<11,'120ms real frames should show about 8 FPS, not capped 17 FPS: '+slow.fps);
assert(slow.steps.slice(1).every(v=>v.dt<=.06000001),'visual/FX physics delta remains safely capped');
assert(slow.steps.slice(1).every(v=>v.movementDt>.119&&v.movementDt<.121),'120ms foreground stalls preserve movement time');
assert(slow.workTiming.movementCatchupFrames>=40,'slow foreground frames invoke controlled catch-up');
assert(slow.workTiming.movementCatchupTotalMs>2000,'lost movement time is explicitly measured');
const smooth=simulate(1000/60,45);
assert.equal(smooth.workTiming.frameGapOver100,0,'normal 60Hz frames are not stalls');
assert(smooth.fps>55&&smooth.fps<65,'60Hz should show about 60 FPS: '+smooth.fps);
assert(smooth.steps.slice(1).every(v=>Math.abs(v.dt-v.movementDt)<1e-9),'60Hz remains unchanged');
assert.equal(smooth.workTiming.movementCatchupFrames,0,'60Hz has no extra catch-up');
const covered=simulate(1000/60,45,'lobby');
assert.equal(covered.drawTiming.frames,0,'Canvas rendering must be suspended behind lobby overlay');
assert(covered.drawTiming.skippedCoveredFrames>40,'covered rAF samples counted');
const layout=simulate(1000/60,45,'layout');
assert(layout.drawTiming.frames>40,'layout editor must retain live Canvas drawing');
const stalled=simulate(300,45);
assert(stalled.fps>3&&stalled.fps<5,'300ms frames should not be misreported as 17 FPS');
assert(stalled.steps.slice(1).every(v=>v.movementDt<=.06000001),'300ms rAF freezes stay safely capped');
// Source-extracted wall collision test: a low-FPS 100px movement must not
// tunnel across a thin barrier even when the endpoint would be clear.
const movementStart=html.indexOf('function moveWithWallSubsteps('),movementEnd=html.indexOf('// Only active motion needs',movementStart);
assert(movementStart>0&&movementEnd>movementStart&&movementEnd-movementStart<550,'extract live collision-safe stepper');
function world(wall){
 const local={x:100,y:200};
 const c={R:20,Math,local,moveWithWall(dx,dy){
  const nx=local.x+dx;
  if(!wall||!(nx+20>130&&nx-20<142))local.x=nx;
  local.y+=dy;
 }};
 vm.createContext(c);
 vm.runInContext(html.slice(movementStart,movementEnd)+'this.step=moveWithWallSubsteps;',c);
 return c;
}
const open=world(false);open.step(110,0);
assert(Math.abs(open.local.x-210)<.0001,'movement conserves distance in the open');
const blocked=world(true);blocked.step(110,0);
assert(blocked.local.x>=100&&blocked.local.x<=110,'substeps stop at thin wall: '+blocked.local.x);
assert.match(html,/moveWithWallSubsteps\(dx\*speed\*boost\*slow\*movementDt/,'live actor movement uses safe substeps');
assert.match(html,/local\.vx=\(local\.x-oldX\)\/\(movementDt\|\|1\)/,'network velocity normalized to full travel time');
console.log('PASS foreground 120ms movement catch-up, 300ms freeze cap, 60Hz parity, thin-wall collision, FPS accuracy');
