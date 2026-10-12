// Regression: generated 1vs1 solo BOT must not read a concealed opponent's
// current coordinates; pursuit is limited to recently seen positions.
// Pure JS decision test; desktop/touch Chromium is covered by foundation-1v1-browser.cjs.
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('foundation/1v1-foundation-v1.html','utf8');
const begin=html.indexOf('  // Four predictable scout waypoints:');
const end=html.indexOf('  function setUp() {',begin);
assert(begin>0&&end>begin,'find actual compiled 1vs1 BOT implementation');
const code=html.slice(begin,end);
new vm.Script(code,{filename:'runBot'});
function harness({visible=false,now=9000,char='sniper',memory=null,gadgets=2}={}){
 let usedGadget=0,usedShot=0;
 const context={
   W:1000,H:600,RADIUS:18,CHARS:{
     sniper:{speed:102,reload:1.833,range:455},
     gunner:{speed:102,reload:1.25,range:280},
     tank:{speed:102,reload:.833,range:160},
     bomber:{speed:102,reload:1.5,range:300}
   },
   BALANCE:{bomberSlowFactor:.65},BrawlWeaponV1:{overdriveReloadMs:750},
   game:{phase:'playing',debuffs:{}},solo:true,botConfig:{level:'normal'},
   botBrain:{fire:99,strafe:1,strafeTime:10,ammo:3,reload:0,ult:0,
      gadgets,boost:0,overdrive:0,lastSeen:memory},
   $:()=>({value:'normal'}),isPlaying:()=>true,time:()=>now,
   targetVisible:()=>visible,getGasMargin:()=>0,
   clamp:(n,a,b)=>Math.max(a,Math.min(b,n)),
   lineBlocked:()=>false,moveWithWall:(p,dx,dy)=>{p.x+=dx;p.y+=dy;},
   shots:[],avoidAirborneBombs:()=>null,
   botGadgetSolo:()=>{usedGadget++;},botFireSolo:()=>{usedShot++;}
 };
 vm.createContext(context);vm.runInContext(code+';this.runBot=runBot;',context);
 return {step(target,actor={x:500,y:300,char,angle:0}){
   context.runBot(.016,actor,target,true);
   return {angle:actor.angle,brain:context.botBrain,usedGadget,usedShot};
 }};
}
const target=(x,y)=>({x,y,char:'tank'});
const nearMemory={x:390,y:260,at:8500};
const hiddenA=harness({memory:nearMemory}).step(target(620,130));
const hiddenB=harness({memory:nearMemory}).step(target(620,490));
assert(Math.abs(hiddenA.angle-hiddenB.angle)<1e-12,'hidden current location cannot affect BOT facing');
assert.equal(hiddenA.usedShot,0);
assert.equal(hiddenA.usedGadget,0);
console.log('PASS invisible enemy cannot leak coordinates into aim/shoot/skills');
const lost=harness({memory:{x:620,y:110,at:5000}}).step(target(520,301));
assert.equal(lost.brain.lastSeen,null,'expire seen position after 2400ms');
assert.equal(lost.brain.patrolIndex,0,'begin an explicit scout route after memory expires');
const patrolMove=harness().step(target(520,301),{x:350,y:204,char:'sniper',angle:0});
assert.equal(patrolMove.brain.patrolIndex,1,'advance to next waypoint when one is reached');
console.log('PASS lost target expires and BOT searches without camping a ghost position');
const seen=harness({visible:true,now:12000}).step(target(800,300));
assert.equal(seen.brain.lastSeen.x,800);
assert.equal(seen.brain.lastSeen.at,12000);
assert(Math.abs(seen.angle)<.02,'visible enemy can be aimed at normally');
console.log('PASS seen opponent updates memory and real-time aim');
const hiddenTank=harness({char:'tank'}).step(target(690,300),{x:500,y:300,char:'tank',angle:0});
assert.equal(hiddenTank.usedGadget,0,'hidden enemy within dash range must not trigger offensive gadget');
const seenSniper=harness({char:'sniper',visible:true}).step(target(580,300));
assert.equal(seenSniper.usedGadget,1,'visible close opponent can still trigger sniper skill');
console.log('PASS offensive gadgets require genuine visibility; visible skill works');
