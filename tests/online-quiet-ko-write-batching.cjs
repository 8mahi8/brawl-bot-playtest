// Exercise the REAL 2vs2 host tick with a synchronous fake Firebase
// transaction. Quiet KO clock must advance fully while halving safe writes.
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const html=fs.readFileSync(path.join(__dirname,'../online/ipad-squad-v2-lab.html'),'utf8');
const from=html.indexOf('const QUIET_KO_WRITE_AGE_MS='),to=html.indexOf('// Firebase RTDB serializes writes',from);
const fn=html.indexOf('async function processCombatTick()'),end=html.indexOf('function isAuthoritative()',fn);
const fromMetrics=html.indexOf('let tickTxnTiming='),toMetrics=html.indexOf('const PERIODIC_HUD_MAX_AGE_MS=',fromMetrics);
assert(from>0&&to>from&&fn>to&&end>fn&&end-fn<3500,'live KO and RTDB transaction code extracted');
assert(fromMetrics>0&&toMetrics>fromMetrics,'live transaction metrics extracted');
const source=html.slice(fromMetrics,toMetrics)+'\n'+html.slice(from,to)+'\n'+html.slice(fn,end)+
 '\nthis.runTick=processCombatTick;this.metrics=()=>({quiet:{...quietTickMetrics},txn:{...tickTxnTiming}});';
const IDs=['blue-a','blue-b','red-a','red-b'],seats=Object.fromEntries(IDs.map((id,i)=>[['blue1','blue2','red1','red2'][i],{id}]));
function rig({age=200,mode='ko',t=1000,projectiles={},scheduled={},debuffs={},events={},hp={},ammo={},remoteChange,ready=true}={}){
 let now=10000,clock=0,steps=[],transactions=0,updaters=0,commits=0;
 let store={phase:'playing',mode,matchId:'m',round:1,hostToken:'cid',combatRev:7,startAt:0,
  seats,hp:Object.fromEntries(IDs.map(id=>[id,hp[id]??100])),
  stats:Object.fromEntries(IDs.map(id=>[id,{char:'tank',ammo:ammo[id]??3,refillAt:0,
   guardUntil:0,boostUntil:0,overdriveUntil:0}])),
  projectiles,scheduled,debuffs,events,
  clock:{wallAt:now-age,t}};
 const room={child(name){assert.equal(name,'game');return {transaction:async updater=>{
  transactions++;if(remoteChange)remoteChange(store);
  updaters++;const n=updater(store);if(n){store=n;commits++;}
  return {committed:!!n};
 }};}};
 const c={performance:{now:()=>++clock},CHARS:{tank:{hp:100}},
  combatBusy:false,hostProcessing:false,hostQueue:[],
  combatTickCalls:0,combatTickSkips:{busy:0,queue:0,clock:0,scope:0},
  combatTickResults:{writes:0,committed:0,missing:0,wrongHost:0,wrongMatch:0,wrongRev:0,noStep:0,error:0},
  game:{...store,projectiles:{...projectiles},scheduled:{...scheduled},debuffs:{...debuffs},events:{...events}},
  room,myConnection:'cid',console,
  serverNow:()=>now,isAuthoritative:()=>true,combatReady:()=>ready,
  inputSnapshot:()=>({}),scheduleHostActionDispatch:()=>{},
  engine:()=>({step(g,_input,at,rev,token){
   assert.equal(token,'cid');assert.equal(g.combatRev,rev);
   const dt=Math.min(100,Math.floor(at-g.clock.wallAt));
   assert(dt>=50,'never call engine with too little elapsed time: '+dt);
   steps.push(dt);
   return {...g,combatRev:g.combatRev+1,clock:{wallAt:at,t:g.clock.t+dt}};
  }})
 };
 vm.createContext(c);vm.runInContext(source,c);
 return {async tick(){await c.runTick();c.game={...store};},time(t){now=t;},state(){return store;},
  values(){return {steps:[...steps],transactions,updaters,commits,...c.metrics(),skips:c.combatTickSkips}}};
}
let tests=0;
async function test(label,fn){await fn();tests++;console.log('PASS quiet KO tick: '+label);}
(async()=>{
 await test('at 100ms safe KO defers entirely, then one write advances full 200ms in two 100ms steps',async()=>{
  const q=rig({age:100});await q.tick();let v=q.values();
  assert.equal(v.transactions,0);assert.equal(v.quiet.deferrals,1);assert.equal(v.txn.starts,0);
  q.time(10100);await q.tick();v=q.values();
  assert.equal(v.transactions,1);assert.equal(v.commits,1);assert.equal(v.updaters,1);
  assert.deepEqual(v.steps,[100,100]);assert.equal(v.quiet.doubleSteps,1);
  assert.equal(q.state().clock.t,1200);assert.equal(q.state().clock.wallAt,10100);
  assert.equal(q.state().combatRev,9);assert.equal(v.txn.engineCalls,2);
 });
 await test('180ms jitter advances all time, not only one clamped 100ms step',async()=>{
  const q=rig({age:180});await q.tick();assert.deepEqual(q.values().steps,[80,100]);
  assert.equal(q.state().clock.t,1180);
 });
 for(const [name,opts] of [
  ['active projectiles',{projectiles:{bullet:{x:10,y:20}}}],
  ['pending ultimate',{scheduled:{ult:{kind:'bomb'}}}],
  ['damage-over-time',{debuffs:{victim:{dotUntil:3000}}}],
  ['recent visual event',{events:{hit:{type:'hit'}}}],
  ['Hot Zone mode',{mode:'area'}],
  ['KO of any player',{hp:{'red-a':0}}],
  ['partially damaged player',{hp:{'red-a':80}}],
  ['ammo still reloading',{ammo:{'blue-b':2}}],
  ['near KO gas boundary',{t:27900}],
 ]){
  await test(name+' retains normal sub-180ms tick',async()=>{
   const q=rig({age:100,...opts});await q.tick();const v=q.values();
   assert.equal(v.transactions,1);assert.deepEqual(v.steps,[100]);assert.equal(v.quiet.deferrals,0);
  });
 }
 await test('database updater rechecks safety if an action changed Firebase state',async()=>{
  const q=rig({age:200,remoteChange:g=>{g.projectiles={bullet:{x:10}};}});
  await q.tick();const v=q.values();
  assert.equal(v.transactions,1);assert.deepEqual(v.steps,[100]);
  assert.equal(v.quiet.doubleSteps,0);assert.equal(v.quiet.unsafeAtCommit,1);
 });
 await test('paused battle makes zero Firebase writes',async()=>{
  const q=rig({ready:false});await q.tick();assert.equal(q.values().transactions,0);
 });
 assert.match(html,/scheduleHostActionDispatch\(\)/,'shot/skill fast dispatch remains present');
 console.log('PASS '+tests+' quiet KO write coalescing scenarios against real host tick source');
})().catch(e=>{console.error(e.stack||e);process.exitCode=1;});
