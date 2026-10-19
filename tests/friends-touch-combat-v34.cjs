// V3.4 touch/combat regression on frozen normal/draft source snapshots.
// Node-only; never reads or writes production Firebase or published pages.
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {spec,makeAll,FRIEND_INPUT_SPANS,patchFriendInputs,validate}=require('../scripts/build-friends-online.cjs');
const root=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const keys=['duelTouchHandlers','duelActionButtons','squadTouchHandlers','squadCombatAim','squadTouchPaint'];
const names=['normal.1vs1','draft.1vs1','normal.2vs2','draft.2vs2'];
const base=makeAll();
for(const key of keys){
 const rule=FRIEND_INPUT_SPANS[key],canonical=read(spec.modules[key]);
 assert(rule,'registered touch/combat source '+key);
 assert(canonical.startsWith(rule.start),'exact starting boundary '+key);
 assert(!canonical.includes(rule.end),'module must not consume next handler '+key);
 for(const name of rule.modes){
  const original=read(spec.modes[name].source),compiled=base[name].html;
  const a=original.indexOf(rule.start),b=original.indexOf(rule.end,a+rule.start.length);
  assert(a>=0&&b>a,'frozen source boundary '+key+'/'+name);
  assert.equal(original.slice(a,b),canonical,'exact normal/draft body '+key+'/'+name);
  assert.equal(original.split(rule.start).length-1,1,'frozen unique start '+key+'/'+name);
  assert.equal(compiled.split(rule.start).length-1,1,'generated unique start '+key+'/'+name);
  assert(compiled.includes(canonical),'shared canonical body emitted in '+key+'/'+name);
  validate(compiled,name,spec.modes[name]);
 }
 const changed=canonical.replace(rule.start,rule.start+'/* V34_TOUCH_CANARY */');
 assert.notEqual(changed,canonical);
 const mutated=makeAll(null,null,null,{[key]:changed});
 for(const name of names){
  if(rule.modes.includes(name)){
   assert(mutated[name].html.includes('V34_TOUCH_CANARY'),key+' edit reaches '+name);
   assert.notEqual(mutated[name].html,base[name].html,key+' edit changes '+name);
  }else{
   assert.equal(mutated[name].html,base[name].html,key+' edit cannot affect '+name);
  }
 }
}
for(const name of names)
 assert.equal(patchFriendInputs(read(spec.modes[name].source),name),
  read(spec.modes[name].source),'initial common touch extraction is byte-exact no-op '+name);
assert(!base['normal.1vs1'].html.includes('function endPointer(e){'));
assert(!base['draft.1vs1'].html.includes('function endPointer(e){'));
assert(!base['normal.2vs2'].html.includes('  function pointerDown(e) {'));
assert(!base['draft.2vs2'].html.includes('  function pointerDown(e) {'));

// Emulate Safari PointerEvents on the ORIGINAL shared 2v2 touch canvas code.
// Verify aiming and movement gestures, cancellation, and no duplicate shots.
{
 const handlers={},shots=[],captures=[],released=[];
 let now=2000;
 const canvas={
  getBoundingClientRect:()=>({width:800,height:600}),
  addEventListener:(kind,fn)=>{assert(!handlers[kind],'one listener for '+kind);handlers[kind]=fn;},
  setPointerCapture:id=>captures.push(id),
  releasePointerCapture:id=>released.push(id)
 };
 const ctx={canvas,Math,Number,Date,performance:{now:()=>now},
  botPilot:false,combatReady:()=>true,alive:()=>true,myId:'player',
  getStagePos:e=>({x:e.x,y:e.y}),inputEventQueueDelay:()=>2,
  pointer:null,aimPointer:null,actionSeq:0,
  local:{x:200,y:200,a:0},enemyCandidate:()=>null,
  shootAngle:(angle,reach)=>{shots.push({angle,reach});ctx.actionSeq++;},
  clamp:(n,min,max)=>Math.min(max,Math.max(min,n)),
  inputTiming:{touchShots:0,lastTouchShot:null}
 };
 vm.createContext(ctx);vm.runInContext(read(spec.modules.squadTouchHandlers),ctx);
 for(const kind of ['pointerdown','pointermove','pointerup','pointercancel','lostpointercapture'])
  assert.equal(typeof handlers[kind],'function','Safari handler registered '+kind);
 const ev=(id,x,y,type='pointerup',pointerType='touch')=>({
  pointerId:id,x,y,type,pointerType,preventDefault(){}});
 handlers.pointerdown(ev(1,200,220,'pointerdown')); // movement half
 assert.equal(ctx.pointer.id,1);
 handlers.pointermove(ev(1,240,250,'pointermove'));
 assert.equal(ctx.pointer.x,240);
 handlers.pointerup(ev(1,240,250));
 assert.equal(ctx.pointer,null,'movement release clears joystick');
 assert.equal(shots.length,0,'movement touch cannot fire');
 handlers.pointerdown(ev(2,600,200,'pointerdown')); // firing half
 handlers.pointermove(ev(2,680,200,'pointermove'));
 now=2175;handlers.pointerup(ev(2,680,200));
 assert.equal(shots.length,1,'manual fire exactly once');
 assert(Math.abs(shots[0].angle)<1e-9,'right swipe fires right');
 assert.equal(shots[0].reach,300,'drag reach uses original capped scaling');
 assert.equal(ctx.inputTiming.touchShots,1,'record one shot timing');
 assert.equal(ctx.inputTiming.lastTouchShot.submitted,true,'action sequence acknowledged');
 assert.equal(ctx.inputTiming.lastTouchShot.canvasDrawSubmittedMs,null,'paint time is not guessed');
 handlers.pointerdown(ev(3,650,230,'pointerdown'));
 handlers.pointercancel(ev(3,660,230,'pointercancel'));
 assert.equal(shots.length,1,'pointer cancel cannot fire');
 handlers.pointerdown(ev(4,700,260,'pointerdown'));
 handlers.lostpointercapture(ev(4,700,260,'lostpointercapture'));
 assert.equal(ctx.aimPointer,null,'lost capture clears stale aim');
 handlers.pointerdown(ev(5,710,300,'pointerdown','mouse'));
 assert.equal(ctx.aimPointer,null,'mouse input must not double-bind touch');
 assert(captures.includes(1)&&captures.includes(2),'canvas captures real touch ids');
}

// Input presentation stamp only estimates handler->Canvas submission, not
// actual screen compositor latency; must be monotonic and only set once.
{
 const context={inputTiming:{lastTouchShot:{submitted:true,handlerEnteredAt:1000,canvasDrawSubmittedMs:null}},Math,Number};
 vm.createContext(context);vm.runInContext(read(spec.modules.squadTouchPaint),context);
 vm.runInContext('recordFirstTouchCanvasPaint(1020.17)',context);
 assert.equal(context.inputTiming.lastTouchShot.canvasDrawSubmittedMs,20.2);
 vm.runInContext('recordFirstTouchCanvasPaint(1200)',context);
 assert.equal(context.inputTiming.lastTouchShot.canvasDrawSubmittedMs,20.2,'first paint stamp is immutable');
}

// Host-authoritative battle write boundaries remain intact in the shared
// aiming source. Test no direct game-state mutation for submitting a shot.
{
 const source=read(spec.modules.squadCombatAim);
 assert(source.includes('submitAction(attack,'),'shot must use existing action stream');
 assert(!source.includes("room.child('game').set("),'input must not write authoritative game snapshot');
 assert(!source.includes("room.child('game').transaction("),'input must not transact HP or KO');
 let shot=null;
 const context={
  lobby:{seats:{blue1:{id:'self'},red1:{id:'enemy'}}},
  game:{matchId:'match',round:1,stats:{self:{char:'sniper',life:0,lastActionSeq:0,overdriveUntil:0}}},
  myId:'self',myConnection:'connection',SEATS:['blue1','red1'],
  myTeam:()=> 'blue',teamOfSeat:s=>s==='blue1'?'blue':'red',
  alive:id=>true,targetPoint:id=>({x:600,y:200}),canSeeEnemy:()=>true,
  shotLineBlocked:()=>false,local:{x:200,y:200,a:0},
  botPilot:false,combatReady:()=>true,engine:()=>({flying:()=>false}),
  derivedAmmo:()=>({ammo:3}),combatNow:()=>1000,
  performance:{now:()=>2000},lastShootLocal:0,
  clamp:(n,a,b)=>Math.min(b,Math.max(a,n)),
  actionSeq:0,Math,Number,Date,serverNow:()=>5500,
  submitAction:(a,msg)=>{shot={...a,msg}}
 };
 vm.createContext(context);vm.runInContext(source,context);
 assert.equal(vm.runInContext('enemyCandidate().x',context),600,'visible enemy selected');
 vm.runInContext('shootAngle(0,200)',context);
 assert.equal(shot.type,'shot');assert.equal(shot.seq,1);
 assert.equal(shot.angle,0);assert.equal(shot.reach,200);
 assert.equal(shot.connectionId,'connection');assert.equal(shot.msg,'射撃送信失敗 ');
 assert.equal(context.actionSeq,1,'local sequence changed without authoritative game write');
}
console.log('PASS V3.4: exact 5 shared touch/action modules on four modes, future edits isolate to owner modes, mobile pointer shoot/cancel/move, first-paint stats, and host-authoritative shot bus');
