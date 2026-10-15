// Validate the exact asynchronous host-dispatch helper embedded in BRAWL online 2vs2.
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const html=fs.readFileSync(path.join(__dirname,'../online/ipad-squad-v2-lab.html'),'utf8');
const begin=html.indexOf('let hostActionDispatchQueued=false;');
const end=html.indexOf('function drainActions()',begin);
assert(begin>0&&end>begin,'Host dispatcher located in full standalone HTML');
const source=html.slice(begin,end);
assert(source.includes('queueMicrotask('),'fast dispatch actually queued');
assert(html.includes('scheduleHostActionDispatch();\n}\nfunction submitAction'),'drainActions uses fast dispatch');
assert(html.includes('p.networkSeen&&!localPendingWrites.has(id)'),'unconfirmed Firebase local writes remain gated');
const embedded=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(m=>m[1]).filter(Boolean);
for(const [i,js]of embedded.entries())new vm.Script(js,{filename:'online squad inline script #'+i});
let count=0;
function test(name,fn){fn();count++;console.log('PASS host fast dispatch: '+name);}
function rig(){
 let micro=[],calls=0;
 const scope={room:{key:'roomA'},game:{matchId:'matchA',round:1},hostQueue:[{id:'shot1'}],
   hostProcessing:false,authenticated:true,ready:true,console,
   isAuthoritative(){return scope.authenticated;},combatReady(){return scope.ready;},
   queueMicrotask(fn){micro.push(fn);},
   processHostQueue(){calls++;return Promise.resolve();}
 };
 vm.createContext(scope);
 vm.runInContext(source+'\nthis.scheduleHostActionDispatch=scheduleHostActionDispatch;',scope);
 return {scope,run(){scope.scheduleHostActionDispatch();},flush(){const tasks=micro;micro=[];tasks.forEach(x=>x());},calls:()=>calls,pending:()=>micro.length};
}
test('confirmed action wakes host on next microtask',()=>{
 const r=rig();r.run();assert.equal(r.calls(),0);r.flush();assert.equal(r.calls(),1);
});
test('burst of actions coalesces to one dispatch',()=>{
 const r=rig();r.run();r.run();r.run();assert.equal(r.pending(),1);r.flush();assert.equal(r.calls(),1);
});
test('no dispatch if not authenticated host',()=>{
 const r=rig();r.scope.authenticated=false;r.run();r.flush();assert.equal(r.calls(),0);
});
test('no dispatch during countdown or pause',()=>{
 const r=rig();r.scope.ready=false;r.run();r.flush();assert.equal(r.calls(),0);
});
test('no dispatch while host transaction already active',()=>{
 const r=rig();r.scope.hostProcessing=true;r.run();r.flush();assert.equal(r.calls(),0);
});
test('stale scheduled microtask cannot affect another room',()=>{
 const r=rig();r.run();r.scope.room={key:'roomB'};r.flush();assert.equal(r.calls(),0);
});
test('stale scheduled microtask cannot affect next round',()=>{
 const r=rig();r.run();r.scope.game={matchId:'matchA',round:2};r.flush();assert.equal(r.calls(),0);
});
test('disconnection before callback cancels dispatch',()=>{
 const r=rig();r.run();r.scope.authenticated=false;r.flush();assert.equal(r.calls(),0);
});
test('queue drained before callback cancels dispatch',()=>{
 const r=rig();r.run();r.scope.hostQueue=[];r.flush();assert.equal(r.calls(),0);
});
test('next independent shot triggers a second dispatch',()=>{
 const r=rig();r.run();r.flush();r.run();r.flush();assert.equal(r.calls(),2);
});
console.log('PASS '+count+' fast host action checks + '+embedded.length+' embedded scripts parsed');
