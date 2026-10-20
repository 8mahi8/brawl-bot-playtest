'use strict';
// V4.8: run the ACTUAL generated quiet Canvas gate in a deterministic VM.
// No Firebase access, published HTML mutation, or artificial RTT claims.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {makeAll,spec,patchSquadQuietEarlyShotWakeV48}=require('../scripts/build-friends-online.cjs');
const fixed=makeAll();
const old=makeAll(null,null,null,null,null,true,true,false,false);
const marker='/* V4.8 remote action Canvas wake */';
for(const mode of ['normal.2vs2','draft.2vs2']){
 assert.equal(fixed[mode].html.split(marker).length-1,1,'one quiet Canvas wake in '+mode);
 assert(!old[mode].html.includes(marker),'control can reproduce old skipping '+mode);
 assert.throws(()=>patchSquadQuietEarlyShotWakeV48(fixed[mode].html,mode),/only be inserted once/);
 assert(!fs.readFileSync(spec.modes[mode].source,'utf8').includes(marker),
  'pinned release candidate unchanged '+mode);
}
for(const mode of ['normal.1vs1','draft.1vs1']){
 assert.equal(fixed[mode].hash,old[mode].hash,'1vs1 never changes '+mode);
 assert(!fixed[mode].html.includes(marker),'no 1vs1 marker '+mode);
}
const SEATS=['blue1','blue2','red1','red2'];
const seats=Object.fromEntries(SEATS.map((key,i)=>[key,{id:'p'+i}]));
function buildGate(html){
 const begin=html.indexOf('const QUIET_CANVAS_REDRAW_MS=');
 const end=html.indexOf('// Home/lobby screens fully cover the arena;',begin);
 assert(begin>=0&&end>begin&&end-begin<4300,'exact generated quiet Canvas gate');
 const ctx={
  scene:'game',solo:false,botPilot:false,lobby:{seats},
  view:{overhead:false},canvas:{clientWidth:1024,clientHeight:650},
  devicePixelRatio:1,canvasQualityCap:2,
  game:{mode:'ko',phase:'playing',matchId:'m',round:1,clock:{wallAt:0},projectiles:{},scheduled:{}},
  local:{vx:0,vy:0},
  positions:Object.fromEntries(SEATS.map((key,i)=>['p'+i,{vx:0,vy:0}])),
  pointer:null,aimPointer:null,ultPointer:null,pcShot:null,pcKeys:new Set(),pcCursor:null,
  fx:[],clientBullets:[],hpPreviewHits:[],earlyShots:new Map(),earlyBombSmoothing:new Map(),
  SEATS,CHARS:{},serverNow:()=>3000,combatReady:()=>true,
  quietKoTickSafe:g=>g.mode==='ko'&&g.phase==='playing',
  combatNow:()=>3000,Object,Math,Number,Set,Map,
 };
 vm.createContext(ctx);
 vm.runInContext(html.slice(begin,end)+'\nthis.wakeDecision=quietCanvasIdleEligible;this.drawAt=shouldDrawCanvasFrame;',ctx);
 return ctx;
}
for(const mode of ['normal.2vs2','draft.2vs2']){
 const current=buildGate(fixed[mode].html),previous=buildGate(old[mode].html);
 for(const gate of [current,previous]){
  assert.equal(gate.wakeDecision(),true,'quiet boards still eligible for idle skip');
  assert.equal(gate.drawAt(1000),true,'first frame draws');
  assert.equal(gate.drawAt(1016),false,'idle frame still skipped');
  gate.earlyShots.set('remote-action',{a:{type:'shot'}});
 }
 assert.equal(previous.wakeDecision(),true,'old gate ignores an unconfirmed remote bullet');
 assert.equal(previous.drawAt(1032),false,'reproduced: next 16ms Canvas frame is SKIPPED despite ACTION preview');
 assert.equal(current.wakeDecision(),false,'early shot wakes quiet Canvas');
 assert.equal(current.drawAt(1032),true,'fixed: next frame renders the transient remote projectile');
 previous.earlyShots.clear();current.earlyShots.clear();
 assert.equal(current.drawAt(1048),true,'wake receives normal smooth settle grace');
 current.earlyBombSmoothing.set('bomb-0',{x:100,y:200});
 assert.equal(current.wakeDecision(),false,'Bomber handoff cannot be hidden by idle throttle');
 current.earlyBombSmoothing.clear();
 assert.equal(current.wakeDecision(),true,'normal quiet behavior after preview cleanup');
 assert.equal(current.drawAt(2000),true,'quiet board refreshes after the action');
 assert.equal(current.drawAt(2016),false,'no perpetual full-frame draw after preview retires');
 current.game.mode='area';current.game.area={contested:false};
 assert.equal(current.drawAt(2032),true,'HOT ZONE mode switch redraws');
 current.earlyShots.set('zone-action',{a:{type:'shot'}});
 assert.equal(current.wakeDecision(),false,'HOT ZONE client preview keeps Canvas active');
 assert.equal(current.drawAt(2048),true,'HOT ZONE draws on the next frame');
 current.earlyShots.clear();current.game.projectiles['server-shot']={x:60,y:20};
 assert.equal(current.wakeDecision(),false,'authoritative projectile still wakes HOT ZONE as before');
}
console.log('PASS V4.8 replicated quiet-KO lost remote preview, fixed next-frame wake in KO and HOT ZONE; Bomber handoff, post-shot idle, 1v1 and pinned HTML unchanged');
