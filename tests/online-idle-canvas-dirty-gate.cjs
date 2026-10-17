// Verify real 2vs2 quiet-KO redraw policy independently of Firebase.
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const html=fs.readFileSync(path.join(__dirname,'../online/ipad-squad-v2-lab.html'),'utf8');
const begin=html.indexOf('const QUIET_CANVAS_REDRAW_MS='),end=html.indexOf('// Home/lobby screens fully cover the arena;',begin);
assert(begin>0&&end>begin&&end-begin<2400,'exact live Canvas gate source');
const SEATS=['blue1','blue2','red1','red2'];
const seats=Object.fromEntries(SEATS.map((key,i)=>[key,{id:'p'+i}]));
const state={
 scene:'game',solo:false,botPilot:false,lobby:{seats},
 game:{mode:'ko',phase:'playing',clock:{wallAt:0}},
 local:{vx:0,vy:0},positions:Object.fromEntries(SEATS.map((key,i)=>['p'+i,{vx:0,vy:0}])),
 pointer:null,aimPointer:null,ultPointer:null,pcShot:false,pcKeys:new Set(),pcCursor:null,
 fx:[],clientBullets:[],hpPreviewHits:[],SEATS,
 serverNow:()=>3000,combatReady:()=>state.game.phase==='playing',
 quietKoTickSafe:g=>g.mode==='ko'&&g.phase==='playing'
};
vm.createContext(state);
vm.runInContext(html.slice(begin,end)+'\nthis.drawAt=shouldDrawCanvasFrame;this.counters=()=>({...quietCanvasMetrics});',state);
assert(state.drawAt(1000),'first visually quiet tick draws full scene');
assert(!state.drawAt(1016),'no-op 16ms frame skips touching Canvas');
assert(!state.drawAt(1200),'no-op 200ms frame leaves static image untouched');
assert(state.drawAt(1240),'periodic static refresh every 240ms keeps UI alive');
assert(!state.drawAt(1256),'does not redraw immediately after quiet refresh');
assert(state.counters().skipped>=3);
state.pointer={id:1};
assert(state.drawAt(1270),'touch resumes drawing on first available frame');
state.pointer=null;
assert(state.drawAt(1290),'camera and remote positions get 500ms post-input settle time');
assert(state.drawAt(1700),'resume grace still allows complete animation');
assert(state.drawAt(1940),'first refresh after settling displays the scene');
assert(!state.drawAt(1956),'stable board resumes skipping draws');
state.positions.p2.vx=30;
assert(state.drawAt(1972),'any moving remote disables Canvas idle gate immediately');
state.positions.p2.vx=0;state.game.phase='paused';
assert(state.drawAt(2030),'pause and transitions are always displayed');
state.game.phase='playing';state.game.mode='area';
assert(state.drawAt(2050),'Hot Zone / area capture never gates Canvas animation');
state.game.mode='ko';state.fx.push({type:'hit',t:.2});
assert(state.drawAt(2070),'active hit FX never skipped');
state.fx.length=0;state.clientBullets.push({id:'predicted'});
assert(state.drawAt(2090),'local predicted shots never skipped');
state.clientBullets.length=0;state.pcKeys.add('d');
assert(state.drawAt(2110),'keyboard movement never skipped');
state.pcKeys.clear();
state.scene='layout';
assert(state.drawAt(2130),'layout editor keeps full live rendering');
state.scene='lobby';
assert.equal(state.drawAt(2146),false,'fully covered lobby never renders Canvas');
assert.match(html,/if\(shouldDrawCanvasFrame\(now\)\)\{const start=performance\.now\(\);draw\(dt\)/,
 'live rAF frame calls redraw guard before writing to main Canvas');
console.log('PASS quiet KO canvas gate: no idle GPU dirties, 240ms refresh, instantaneous movement/shot/skill/FX resume, full area/layout redraw');
