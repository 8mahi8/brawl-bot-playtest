'use strict';
// V4.7 LOCAL deterministic Canvas-preview equivalence + CPU microbenchmark.
// No Firebase calls, game-state writes, identifiers in any output, or published HTML changes.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const {performance}=require('node:perf_hooks');
const {makeAll,spec}=require('../scripts/build-friends-online.cjs');
const old=fs.readFileSync(spec.modules.squadEarlyShots,'utf8');
const next=fs.readFileSync('shared/runtime/friends-2v2-early-shots-v47.inc.js','utf8');
assert.notEqual(next,old,'candidate must differ');
// Disable V3.9 build-time probe injection for byte-exact source comparison;
// the default public-facing build and all its diagnostic hooks remain unchanged.
const original=makeAll(null,null,null,null,null,false);
const candidate=makeAll(next,null,null,null,null,false);
for(const mode of ['normal.1vs1','draft.1vs1']){
 assert.equal(candidate[mode].hash,original[mode].hash,'1v1 unaffected: '+mode);
}
for(const mode of ['normal.2vs2','draft.2vs2']){
 assert(candidate[mode].html.includes(next.trimEnd()),'candidate renders into staging '+mode);
 assert.equal(original[mode].html.includes(next.trimEnd()),false,'default must stay unmodified '+mode);
}
const create=(source,shotCount)=>{
 const actions=[],projectiles={},scheduled={},usedActions={};
 for(let i=0;i<shotCount;i++){
  const id='shot'+i,type=i%3===1?'bomber':'sniper';
  const a={eventId:id,x:150+i,y:220,angle:0,owner:'enemy',
   at:100,reach:500,matchId:'m',round:1};
  actions.push([id,{a,char:type,initial:0,created:0}]);
  usedActions[id]={status:'accepted',acceptedAt:100};
  if(i%7!==0){
   if(type==='bomber'){
    const key=id+':0';
    scheduled[key]={kind:'bomb',key,fireId:id,matchId:'m',round:1};
   }else{
    projectiles[id+':0']={x:10+i,y:10};
   }
  }
 }
 // Unrelated authoritative objects must be ignored in lookups.
 for(let i=0;i<350;i++)projectiles['other'+i+':0']={x:10,y:20};
 for(let i=0;i<70;i++){
  const key='unrelated'+i+':0';
  scheduled[key]={kind:'bomb',key,fireId:'unrelated'+i};
 }
 const drawOps=[];
 const fakeCtx={beginPath(){},arc(x,y,r){drawOps.push(['arc',x,y,r]);},
  stroke(){},fill(){},fillRect(x,y,w,h){drawOps.push(['rect',x,y,w,h]);},
  set fillStyle(x){},set strokeStyle(x){},set lineWidth(x){}};
 const context={Map,Set,Object,Math,Array,Number,performance:{now:()=>150},
  game:{phase:'playing',matchId:'m',round:1,stats:{},clock:{wallAt:400},
    usedActions,projectiles,scheduled},
  connected:true,paused:false,ctx:fakeCtx,myId:'self',
  playerSeat:()=> 'red1',teamOfSeat:()=> 'red',
  bulletVisuals:new Map(),CHARS:{sniper:{range:550},bomber:{range:500}},
  BALANCE:{bomberRange:500,bomberFlightMs:700},
  clamp:(n,a,b)=>Math.min(b,Math.max(a,n)),
  engine:()=>({landing:({x,y},angle,reach)=>({x:x+reach,y})}),
  performanceNow:()=>150
 };
 vm.createContext(context);
 vm.runInContext(source,context,{filename:'early-shots'});
 context.seedActions=actions;
 context.drawOps=drawOps;
 vm.runInContext("globalThis.__reset=()=>{earlyShots.clear();earlyBombSmoothing.clear();earlyShotStats={incoming:0,shown:0,bomber:0,hostHandoffs:0};bulletVisuals.clear();drawOps.length=0;for(const [id,p] of seedActions)earlyShots.set(id,p);};",context);
 vm.runInContext("globalThis.__state=()=>({ids:[...earlyShots.keys()],smoothing:[...earlyBombSmoothing.entries()],bullets:[...bulletVisuals.entries()],stats:{...earlyShotStats},draws:drawOps});",context);
 context.run=vm.runInContext("(()=>{__reset();renderEarlyShots(150);return __state();})",context);
 context.bench=vm.runInContext("(n)=>{for(let i=0;i<n;i++){__reset();renderEarlyShots(150);}}",context);
 return context;
};
for(const count of [0,1,2,3,4,5,20,48]){
 const a=create(old,count).run(),b=create(next,count).run();
 assert.deepEqual(JSON.parse(JSON.stringify(b)),JSON.parse(JSON.stringify(a)),
  'visible frames, ghost cleanup, authoritative handoff and local smoothing parity, shots '+count);
}
function timed(fn,reps){
 const results=[];
 for(let r=0;r<5;r++){
  const started=performance.now();fn(reps);
  results.push(Math.round((performance.now()-started)*100)/100);
 }
 results.sort((a,b)=>a-b);
 return results[2];
}
const denseOld=create(old,48),denseNew=create(next,48);
const sparseOld=create(old,1),sparseNew=create(next,1);
const oldDense=timed(denseOld.bench,200),newDense=timed(denseNew.bench,200);
const oldSparse=timed(sparseOld.bench,600),newSparse=timed(sparseNew.bench,600);
console.log('PASS V4.7 authoritative shot previews identical for 0/1/2/3/4/5/20/48 simultaneous ACTIONS; default unchanged in all modes');
console.log('V4.7 QA-only Node microbench, median of five rounds (not iPad FPS): '+JSON.stringify({
 dense:{frames:200,legacyMs:oldDense,indexedMs:newDense,
  speedup:Math.round(100*oldDense/newDense)/100},
 sparse:{frames:600,legacyMs:oldSparse,indexedMs:newSparse,
  speedup:Math.round(100*oldSparse/newSparse)/100}
}));
