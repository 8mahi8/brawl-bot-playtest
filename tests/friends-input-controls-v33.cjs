// V3.3 shared friend input regression. Never connect to production Firebase.
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const vm=require('node:vm');
const {spec,makeAll,patchFriendInputs,FRIEND_INPUT_SPANS,validate}=require('../scripts/build-friends-online.cjs');
const root=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const modeNames=['normal.1vs1','draft.1vs1','normal.2vs2','draft.2vs2'];
const active=makeAll(),keys=Object.keys(FRIEND_INPUT_SPANS);
assert.deepEqual(keys,['duelPointerAim','squadPointerAim','squadInputTiming','squadCollisionMovement']);
for(const [key,rule] of Object.entries(FRIEND_INPUT_SPANS)){
 const originalSpans=[];
 const canonical=read(spec.modules[key]);
 assert(canonical.startsWith(rule.start),'shared input begins with exact legacy marker '+key);
 assert(!canonical.includes(rule.end),'shared input must not include next block '+key);
 for(const name of rule.modes){
  const legacy=read(spec.modes[name].source),generated=active[name].html;
  const begin=legacy.indexOf(rule.start),end=legacy.indexOf(rule.end,begin+rule.start.length);
  assert(begin>=0&&end>begin,'original input source exists '+name+'/'+key);
  const body=legacy.slice(begin,end);originalSpans.push(body);
  assert.equal(legacy.split(rule.start).length-1,1,'original input function unique '+name+'/'+key);
  assert.equal(generated.split(rule.start).length-1,1,'generated input function unique '+name+'/'+key);
  assert(generated.includes(canonical),'canonical input in generated '+name+'/'+key);
  validate(generated,name,spec.modes[name]);
 }
 assert.equal(originalSpans[0],originalSpans[1],'ordinary/draft byte-identical input source '+key);
 // At initial extraction this is an exact no-op. Future canonical fixes may
 // differ from the pinned input; they must still reach both generated modes.
 const overrides={[key]:canonical.replace(rule.start,rule.start+'/* V33_INPUT_CANARY */')};
 assert.notEqual(overrides[key],canonical,'test module edited '+key);
 const changed=makeAll(null,null,null,overrides);
 for(const name of modeNames){
  if(rule.modes.includes(name)){
   assert.notEqual(changed[name].html,active[name].html,'one edit reaches '+name+'/'+key);
   assert(changed[name].html.includes('V33_INPUT_CANARY'),'changed input present '+name+'/'+key);
  }else{
   assert.equal(changed[name].html,active[name].html,'unrelated mode unchanged '+name+'/'+key);
  }
 }
}
for(const name of modeNames){
 const legacy=read(spec.modes[name].source);
 const generated=patchFriendInputs(legacy,name);
 // Initial shared source is byte-for-byte identical; once it evolves, the
 // stored legacy HTML remains untouched and the staged version alone changes.
 const unchanged=Object.keys(FRIEND_INPUT_SPANS).every(key=>
  !spec.modes[name].modules.includes(key)||(()=>{
   const rule=FRIEND_INPUT_SPANS[key],a=legacy.indexOf(rule.start),b=legacy.indexOf(rule.end,a+rule.start.length);
   return legacy.slice(a,b)===read(spec.modules[key]);
  })());
 if(unchanged)assert.equal(generated,legacy,'no-op at initial canonical extraction '+name);
}
assert.throws(()=>patchFriendInputs('invalid HTML','normal.2vs2'),/missing block/);
const clamp=(v,min,max)=>Math.min(max,Math.max(min,v));
{
 const env={pcAim:null,canvas:{getBoundingClientRect:()=>({left:100,top:50})},
  isPlaying:()=>true,botPilot:false,layoutEditing:false,
  view:{scale:2,ox:10,oy:20},W:1000,H:700,
  local:{x:60,y:70,angle:.7},clamp,Math};
 vm.createContext(env);vm.runInContext(read(spec.modules.duelPointerAim),env);
 assert.equal(vm.runInContext('pcReach()',env),330,'duel default reach preserved');
 vm.runInContext('pcPointer({clientX:300,clientY:220})',env);
 assert.equal(env.pcAim.x,95);assert.equal(env.pcAim.y,75);
 assert.equal(vm.runInContext('pcReach()',env),55,'duel short aim clamps to 55');
 assert(Math.abs(vm.runInContext('pcAngle()',env)-Math.atan2(5,35))<1e-10);
 env.layoutEditing=true;vm.runInContext('pcPointer({clientX:400,clientY:400})',env);
 assert.equal(env.pcAim.x,95,'duel editing disables mouse aim');
}
{
 const env={pcAim:null,pcCursor:null,scene:'game',botPilot:false,view:{scale:1},
  local:{x:120,y:100,a:1.7},W:1920,H:1120,clamp,Math,
  getStagePos:e=>({x:e.x,y:e.y}),viewCoords:p=>p};
 vm.createContext(env);vm.runInContext(read(spec.modules.squadPointerAim),env);
 assert.equal(vm.runInContext('pcReach()',env),310,'2v2 default reach remains 310, separate from duel');
 vm.runInContext('pcPointer({x:3000,y:250})',env);
 assert.equal(env.pcAim.x,1920,'2v2 aim clamps to world width');
 assert.equal(env.pcAim.y,250);
 env.scene='layout';vm.runInContext('pcPointer({x:40,y:40})',env);
 assert.equal(env.pcAim.x,1920,'noncombat 2v2 pointer ignored');
}
{
 const env={performance:{now:()=>1000,timeOrigin:1700000000000},Date,Number,Math};
 vm.createContext(env);vm.runInContext(read(spec.modules.squadInputTiming),env);
 assert.equal(vm.runInContext('inputEventQueueDelay({timeStamp:995},1000)',env),5);
 assert.equal(vm.runInContext('inputEventQueueDelay({timeStamp:1700000000995},1000)',env),5);
 assert.equal(vm.runInContext('inputEventQueueDelay({timeStamp:0},1000)',env),null);
 assert.equal(vm.runInContext('inputEventQueueDelay({timeStamp:1},12000)',env),null);
}
{
 const env={local:{x:100,y:100},R:18,W:1920,H:1120,Math,clamp,
  touchingWall:(x,y)=>x>160};
 vm.createContext(env);vm.runInContext(read(spec.modules.squadCollisionMovement),env);
 vm.runInContext('moveWithWallSubsteps(50,0)',env);
 assert(Math.abs(env.local.x-150)<1e-9,'small foreground movement applies within floating-point tolerance');
 vm.runInContext('moveWithWallSubsteps(100,40)',env);
 assert(env.local.x<=160,'substeps cannot jump through a wall');
 assert(env.local.y>100,'sliding along wall remains allowed');
}
console.log('PASS V3.3 4 modes: byte-identical legacy input blocks, no-op initial staged generation, canary edits target only correct modes, duel vs squad aim profiles, timing and wall substeps');
