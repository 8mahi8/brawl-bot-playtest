// FPS HUD must reflect actual browser frame pacing, even when safe movement
// simulation clamps a long delta after a busy frame or Safari resume.
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const html=fs.readFileSync(path.join(__dirname,'../online/ipad-squad-v2-lab.html'),'utf8');
const begin=html.indexOf('function frame(now){'),end=html.indexOf('function setLayoutDrag(',begin);
assert(begin>0&&end>begin&&end-begin<1500,'exact live rendering-loop source');
const live=html.slice(begin,end);
function simulate(interval,frames,scene='game'){
 const steps=[],ctx={
  lastFrame:0,fps:60,gadgetToastExpiry:0,fx:[],scene,
  performance:{now:()=>4},document:{hidden:false},
  workTiming:{frameSamples:0,frameGapOver100:0,frameGapMaxMs:0,updateTotalMs:0,botTotalMs:0,nonDrawTotalMs:0,nonDrawMaxMs:0},
  drawTiming:{frames:0,totalDrawMs:0,lastDrawMs:0,maxDrawMs:0,skippedCoveredFrames:0},
  clamp:(n,a,b)=>Math.max(a,Math.min(b,n)),adjustCanvasQuality:()=>{},update:dt=>steps.push(dt),
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
assert(slow.steps.slice(1).every(dt=>dt<=.06000001),'movement physics delta remains safely capped');
const smooth=simulate(1000/60,45);
assert.equal(smooth.workTiming.frameGapOver100,0,'normal 60Hz frames are not stalls');
assert(smooth.fps>55&&smooth.fps<65,'60Hz should show about 60 FPS: '+smooth.fps);
const covered=simulate(1000/60,45,'lobby');
assert.equal(covered.drawTiming.frames,0,'Canvas rendering must be suspended behind lobby overlay');
assert(covered.drawTiming.skippedCoveredFrames>40,'covered rAF samples counted');
const layout=simulate(1000/60,45,'layout');
assert(layout.drawTiming.frames>40,'layout editor must retain live Canvas drawing');
const stalled=simulate(300,45);
assert(stalled.fps>3&&stalled.fps<5,'300ms frames should not be misreported as 17 FPS');
console.log('PASS FPS interval accuracy, physics cap, covered lobby drawing skip, and live layout rendering');
