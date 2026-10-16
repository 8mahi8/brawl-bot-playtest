// Tests the exact host action batching code in the standalone BRAWL 2vs2 HTML.
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const html=fs.readFileSync(path.join(__dirname,'../online/ipad-squad-v2-lab.html'),'utf8');
const begin=html.indexOf('const HOST_ACTION_BATCH_LIMIT=6;');
const end=html.indexOf('function projectileStep(',begin);
assert(begin>0&&end>begin&&end-begin<2500,'bounded live code section exists');
assert(html.includes('p.networkSeen&&!localPendingWrites.has(id)'),'only server-confirmed Firebase actions enter the host queue');
const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(x=>x[1]).filter(x=>x.trim());
scripts.forEach((code,i)=>new vm.Script(code,{filename:'full 2vs2 script '+i}));
const action=(id,owner='a',extra={})=>({eventId:id,owner,connectionId:'cid',at:10000,matchId:'M1',round:1,seq:Number(id.replace(/\D/g,''))||1,...extra});
function rig(actions,options={}){
 const events={writes:0,callCount:0,snapshot:0,steps:0,commits:[],logs:[],dispatches:0};
 let store={hostToken:'hostCID',matchId:'M1',round:1,phase:'playing',processed:[],clock:{wallAt:options.clockWallAt??9900,t:0},combatRev:0};
 const presence={a:{cid:true},b:{cid:true}};
 const c={
  HOST_ACTION_BATCH_LIMIT:6,hostProcessing:false,combatBusy:!!options.combatBusy,hostQueue:[...actions],game:{...store},
  room:null,myConnection:'hostCID',presence,queuedActions:new Set(actions.map(a=>a.eventId)),
  ACTION_TTL:3000,ACTION_FUTURE:250,console:{warn:(...xs)=>events.logs.push(xs.join(' '))},
  combatReady:()=>options.ready!==false,
  isAuthoritative:()=>options.host!==false,
  validActionRequest:a=>a.type!=='invalid',
  scheduleHostActionDispatch:()=>{events.dispatches++},
  inputSnapshot:()=>{events.snapshot++;return{}},
  serverNow:()=>10000,
  engine:()=>({
   accept:(g,a)=>({...g,processed:[...g.processed,a.eventId]}),
   step:(g,_input,at,rev,token)=>{
    assert.equal(token,'hostCID');assert.equal(rev,g.combatRev);
    events.steps++;
    return {...g,combatRev:rev+1,clock:{wallAt:at,t:g.clock.t+100}};
   }
  })
 };
 const room={
  child(path){
   assert.equal(path,'game');
   return{
    async transaction(fn){
     events.writes++;
     if(options.fail===events.writes)throw Error('offline');
     const proposed=fn(store);
     if(options.reject===events.writes)return {committed:false};
     if(proposed){store=proposed;events.commits.push(proposed.processed.map(x=>x));}
     return {committed:!!proposed};
    }
   };
  }
 };
 c.room=room;vm.createContext(c);
 vm.runInContext(html.slice(begin,end)+'\nthis.processHostQueue=processHostQueue',c);
 return {c,room,events,run:()=>c.processHostQueue(),read:()=>store,append:x=>{c.hostQueue.push(x);c.queuedActions.add(x.eventId)}};
}
let passed=0;
async function check(name,fn){await fn();passed++;console.log('PASS batch host actions: '+name)}
(async()=>{
 await check('six accepted shots commit once, ordered and none lost',async()=>{
  const r=rig(Array.from({length:6},(_,i)=>action('shot'+(i+1))));
  await r.run();assert.equal(r.events.writes,1);assert.equal(r.read().processed.join(','),'shot1,shot2,shot3,shot4,shot5,shot6');
  assert.equal(r.events.snapshot,1);
 });
 await check('seven shots require only two transactions',async()=>{
  const r=rig(Array.from({length:7},(_,i)=>action('shot'+(i+1))));
  await r.run();assert.equal(r.events.writes,2);assert.equal(r.read().processed.length,7);
 });
 await check('invalid actions and wrong scope never commit',async()=>{
  const r=rig([action('bad1','a',{type:'invalid'}),action('bad2','a',{round:3}),action('bad3','a',{connectionId:'fake'})]);
  await r.run();assert.equal(r.events.writes,0);assert.equal(r.read().processed.length,0);
 });
 await check('auth rejects non-host and missing token',async()=>{
  const a=rig([action('shot1')],{host:false});await a.run();assert.equal(a.events.writes,0);
  const b=rig([action('shot1')]);b.c.myConnection='wrong';await b.run();assert.equal(b.events.writes,0);
 });
 await check('stale action timestamp filtered',async()=>{
  const r=rig([action('old1','a',{at:1000}),action('future2','a',{at:11000}),action('good3')]);
  await r.run();assert.equal(r.events.writes,1);assert.equal(r.read().processed.join(','),'good3');
 });
 await check('same-player sequences preserved in arrival order',async()=>{
  const r=rig([action('shot2'),action('shot3'),action('shot4')]);await r.run();
  assert.equal(r.read().processed.join(','),'shot2,shot3,shot4');
 });
 await check('failed transaction unlocks queued IDs for retry',async()=>{
  const r=rig([action('shot1'),action('shot2')],{fail:1});await r.run();
  assert.equal(r.read().processed.length,0);assert.equal(r.c.queuedActions.size,0);
  assert.equal(r.c.hostProcessing,false);
 });
 await check('uncommitted transaction releases shots for a later retry',async()=>{
  const request=action('shot1'),r=rig([request],{reject:1});
  await r.run();
  assert.equal(r.events.writes,1);
  assert.equal(r.read().processed.length,0);
  assert.equal(r.c.hostProcessing,false);
  assert.equal(r.c.queuedActions.has(request.eventId),false);
  r.append(request); // The next host poll re-queues the same confirmed action.
  await r.run();
  assert.equal(r.events.writes,2);
  assert.equal(r.read().processed.join(','),'shot1');
 });
 await check('uncommitted burst defers remaining work instead of spinning',async()=>{
  const r=rig(Array.from({length:7},(_,i)=>action('shot'+(i+1))),{reject:1});
  await r.run();
  assert.equal(r.events.writes,1,'do not spin on an aborted RTDB transaction');
  assert.equal(r.c.hostQueue.length,1,'unconsumed batch stays queued');
  assert.equal(r.c.queuedActions.has('shot1'),false,'consumed request is retryable');
  assert.equal(r.events.dispatches,0,'wait for periodic retry rather than recursive microtasks');
  await r.run();
  assert.equal(r.read().processed.join(','),'shot7');
 });
 await check('no actions processed during paused match',async()=>{
  const r=rig([action('shot1')],{ready:false});await r.run();assert.equal(r.events.writes,0);
 });
 await check('different match or expired token aborts authoritatively',async()=>{
  const r=rig([action('shot1')]);r.c.game.matchId='M2';await r.run();assert.equal(r.events.writes,0);
 });
 await check('batch has no network writes for invalid-only set',async()=>{
  const r=rig([action('bad1','a',{type:'invalid'})]);await r.run();assert.equal(r.events.writes,0);
 });
 await check('shot acceptance and due bullet physics happen in the SAME transaction',async()=>{
  const r=rig([action('shot1'),action('shot2')]);
  await r.run();
  assert.equal(r.events.writes,1);
  assert.equal(r.events.steps,1);
  assert.equal(r.read().combatRev,1);
  assert.equal(r.read().clock.wallAt,10000);
  assert.equal(r.read().processed.join(','),'shot1,shot2');
 });
 await check('too-young physics clock avoids extra step but accepts shot',async()=>{
  const r=rig([action('shot1')],{clockWallAt:9980});
  await r.run();
  assert.equal(r.events.writes,1);
  assert.equal(r.events.steps,0);
  assert.equal(r.read().processed.length,1);
 });
 await check('in-flight combat tick blocks action transaction competition',async()=>{
  const r=rig([action('shot1')],{combatBusy:true});
  await r.run();
  assert.equal(r.events.writes,0);
  assert.equal(r.c.hostQueue.length,1);
 });
 console.log('PASS '+passed+' batching cases and '+scripts.length+' embedded JS scripts compiled');
})().catch(e=>{console.error(e.stack||e);process.exitCode=1});
