// Regression for the exact 2vs2 host game-write arbiter embedded in Google-Sites-compatible HTML.
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const html=fs.readFileSync(path.join(__dirname,'../online/ipad-squad-v2-lab.html'),'utf8');
const begin=html.indexOf('async function processCombatTick()');
const end=html.indexOf('function isAuthoritative()',begin);
assert(begin>0&&end>begin&&end-begin<2000,'real host tick function is present');
const embedded=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(m=>m[1]).filter(Boolean);
embedded.forEach((x,i)=>new vm.Script(x,{filename:'embedded 2vs2 js #'+i}));
function rig(opts={}){
 const metrics={transactions:0,steps:0,dispatched:0};
 let current={hostToken:'host1',matchId:'m1',round:1,phase:'playing',combatRev:3,clock:{wallAt:opts.wallAt??9920,t:1000}};
 let complete;
 const room={child(name){assert.equal(name,'game');return{async transaction(update){
  metrics.transactions++;
  if(opts.hold)await new Promise(resolve=>complete=resolve);
  const next=update(current);
  if(next)current=next;
  return {committed:!!next};
 }}}};
 const c={
  combatBusy:false,hostProcessing:!!opts.hostProcessing,
  combatTickCalls:0,combatTickSkips:{busy:0,queue:0,scope:0,clock:0},
  combatTickResults:{writes:0,committed:0,missing:0,wrongHost:0,wrongMatch:0,wrongRev:0,noStep:0,error:0},
  hostQueue:opts.queued?[{eventId:'shot'}]:[],
  game:{...current},room,myConnection:'host1',console,
  serverNow:()=>10000,isAuthoritative:()=>opts.host!==false,combatReady:()=>opts.ready!==false,
  inputSnapshot:()=>({}),scheduleHostActionDispatch:()=>{metrics.dispatched++},
  engine:()=>({step:(g,input,now,rev,token)=>{
   assert.equal(rev,g.combatRev);assert.equal(token,'host1');
   metrics.steps++;return {...g,combatRev:rev+1,clock:{t:g.clock.t+80,wallAt:now}};
  }})
 };
 vm.createContext(c);
 vm.runInContext(html.slice(begin,end)+'\nthis.processCombatTick=processCombatTick',c);
 return {c,metrics,run:()=>c.processCombatTick(),read:()=>current,release:()=>complete?.()};
}
let passed=0;
async function check(name,fn){await fn();passed++;console.log('PASS host arbiter: '+name)}
(async()=>{
 await check('elapsed 80ms advances engine in one transaction',async()=>{
  const r=rig();await r.run();assert.equal(r.metrics.transactions,1);assert.equal(r.metrics.steps,1);assert.equal(r.read().combatRev,4);
 });
 await check('less than 50ms elapsed does not write to Firebase',async()=>{
  const r=rig({wallAt:9980});await r.run();assert.equal(r.metrics.transactions,0);assert.equal(r.metrics.steps,0);
 });
 await check('active action batch takes priority over combat tick',async()=>{
  const r=rig({hostProcessing:true});await r.run();assert.equal(r.metrics.transactions,0);
 });
 await check('queued actions take priority over periodic combat tick',async()=>{
  const r=rig({queued:true});await r.run();assert.equal(r.metrics.transactions,0);
 });
 await check('client that is not host cannot advance combat',async()=>{
  const r=rig({host:false});await r.run();assert.equal(r.metrics.transactions,0);
 });
 await check('paused combat cannot create a periodic transaction',async()=>{
  const r=rig({ready:false});await r.run();assert.equal(r.metrics.transactions,0);
 });
 await check('host-token mismatch cancels transaction state change',async()=>{
  const r=rig();r.c.myConnection='different';await r.run();assert.equal(r.metrics.transactions,0);
 });
 await check('a shot arriving mid-tick is dispatched immediately after completion',async()=>{
  const r=rig({hold:true});
  const pending=r.run();
  await Promise.resolve();
  assert.equal(r.c.combatBusy,true);
  r.c.hostQueue.push({eventId:'new shot'});
  r.release();
  await pending;
  assert.equal(r.c.combatBusy,false);
  assert.equal(r.metrics.dispatched,1);
 });
 console.log('PASS '+passed+' live host transaction arbitration checks, '+embedded.length+' HTML scripts compile');
})().catch(e=>{console.error(e.stack||e);process.exitCode=1});
