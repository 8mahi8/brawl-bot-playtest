// FPS HUD must reflect actual browser frame pacing, even when safe movement
// simulation clamps a long delta after a busy frame or Safari resume.
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const html=fs.readFileSync(path.join(__dirname,'../online/ipad-squad-v2-lab.html'),'utf8');
const begin=html.indexOf('function frame(now){'),end=html.indexOf('function setLayoutDrag(',begin);
assert(begin>0&&end>begin&&end-begin<1500,'exact live rendering-loop source');
const live=html.slice(begin,end);
function simulate(interval,frames){
 const steps=[],ctx={
  lastFrame:0,fps:60,gadgetToastExpiry:0,fx:[],
  clamp:(n,a,b)=>Math.max(a,Math.min(b,n)),update:dt=>steps.push(dt),
  updateBots:()=>{},combatReady:()=>false,draw:()=>{},requestAnimationFrame:()=>{}
 };
 vm.createContext(ctx);
 vm.runInContext(live+'\nthis.tick=frame;',ctx);
 for(let i=0;i<=frames;i++)ctx.tick(1000+i*interval);
 return {fps:ctx.fps,steps};
}
const slow=simulate(120,45);
assert(slow.fps>8&&slow.fps<11,'120ms real frames should show about 8 FPS, not capped 17 FPS: '+slow.fps);
assert(slow.steps.slice(1).every(dt=>dt<=.06000001),'movement physics delta remains safely capped');
const smooth=simulate(1000/60,45);
assert(smooth.fps>55&&smooth.fps<65,'60Hz should show about 60 FPS: '+smooth.fps);
const stalled=simulate(300,45);
assert(stalled.fps>3&&stalled.fps<5,'300ms frames should not be misreported as 17 FPS');
console.log('PASS actual WebKit-style frame intervals reflected in FPS, while physics delta cap is unchanged');
