// BRAWL transport boundary: share only the identical 2v2 position-send policy.
// Do not merge pair/quad wire protocols or the host's action tick/transaction.
// Full HTML input remains pinned and publication is manual.
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {spec,makeAll,patchPositionPublish}=require('../scripts/build-friends-online.cjs');
const root=path.resolve(__dirname,'..'),read=x=>fs.readFileSync(path.join(root,x),'utf8');
const shared=read(spec.modules.squadPositionPublish);
const begin='// Only active motion needs the 80ms network cadence.',end='function update(dt,movementDt=dt)';
function part(s){
 const a=s.indexOf(begin),b=s.indexOf(end,a);
 assert(a>=0&&b>a,'position policy absent');
 return s.slice(a,b);
}
const normal=makeAll();
for(const name of ['normal.2vs2','draft.2vs2']){
 const {mode,html}=normal[name],source=read(mode.source);
 assert.equal(part(source),shared,'real existing '+name+' transport differs from shared policy');
 assert.equal(part(html),shared,'emitted '+name+' transport differs from shared policy');
 assert.equal(patchPositionPublish(source,shared),source,'no changes to existing 2v2 runtime');
 for(const marker of ['function processHostQueue(){','function scheduleHostActionDispatch(){','function sendAction(type,angle,reach=310){','function sendPositionNow(){']){
  assert(html.includes(marker),name+' dedicated host/action path lost '+marker);
  const actualSource=source.slice(source.indexOf(marker),source.indexOf(marker)+340);
  const builtSource=html.slice(html.indexOf(marker),html.indexOf(marker)+340);
  assert.equal(builtSource,actualSource,name+' host/action network path changed');
 }
 assert.equal(html.match(/const POSITION_ACTIVE_INTERVAL_MS=80,POSITION_IDLE_HEARTBEAT_MS=500;/g)?.length,1,'position constants doubled');
}
for(const name of ['normal.1vs1','draft.1vs1']){
 assert(!normal[name].mode.modules.includes('squadPositionPublish'),'1v1 must not run four-player cadence');
 assert(!normal[name].html.includes('function positionPublishDue('),'1v1 movement throttling must stay specialized');
 assert(normal[name].html.includes('function sendPosition(){'),'1v1 pair writer remains');
}
const modified=shared.replace('POSITION_IDLE_HEARTBEAT_MS=500','POSITION_IDLE_HEARTBEAT_MS=510');
assert.notEqual(modified,shared,'test edit performed');
const updated=makeAll(null,modified);
for(const name of ['normal.2vs2','draft.2vs2']){
 assert.notEqual(updated[name].html,normal[name].html,'one module edit must change both 2v2 builds');
 assert(updated[name].html.includes('POSITION_IDLE_HEARTBEAT_MS=510'));
}
for(const name of ['normal.1vs1','draft.1vs1'])assert.equal(updated[name].html,normal[name].html,'2v2 module must not touch 1v1');
assert.throws(()=>patchPositionPublish('missing source',shared),/missing block/);

const {positionPublishDue}=vm.runInNewContext(shared+'\n({positionPublishDue})');
const p={x:300,y:240,a:0,vx:0,vy:0,connectionId:'connA',matchId:'matchA',round:1,motionRev:2,life:1};
const next=(q={})=>({...p,...q});
assert.equal(positionPublishDue(null,p,0),true,'initial packet');
for(const key of ['connectionId','matchId','round','motionRev','life']){
 assert.equal(positionPublishDue(p,next({[key]:'connectionId'===key?'connB':'matchId'===key?'matchB':p[key]+1}),1),true,
  'scope/life/motion change must bypass throttle: '+key);
}
assert.equal(positionPublishDue(p,next(),79),false,'not yet active interval');
assert.equal(positionPublishDue(p,next(),80),false,'idle should be suppressed');
assert.equal(positionPublishDue(p,next(),499),false,'no premature idle heartbeat');
assert.equal(positionPublishDue(p,next(),500),true,'500ms idle heartbeat');
assert.equal(positionPublishDue(p,next({vx:40}),79),false,'active packet still paced');
assert.equal(positionPublishDue(p,next({vx:40}),80),true,'moving player sends after 80ms');
assert.equal(positionPublishDue({...p,vx:40},next({vx:0}),80),true,'stop motion sends');
assert.equal(positionPublishDue(p,next({a:.041}),80),true,'significant aim change');
assert.equal(positionPublishDue(p,next({a:.039}),80),false,'minor angle noise ignored');
assert.equal(positionPublishDue(p,next({x:300.401}),80),true,'meaningful position change');
assert.equal(positionPublishDue(p,next({x:300.399}),80),false,'subpixel position jitter coalesced');

function simulate(input,frameMs=16,totalMs=2000){
 let previous=null,lastSent=-Infinity,count=0,lastTimes=[];
 for(let ms=0;ms<=totalMs;ms+=frameMs){
  const pose=next(input(ms));
  if(positionPublishDue(previous,pose,ms-lastSent)){previous=pose;lastSent=ms;count++;lastTimes.push(ms);}
 }
 return {count,lastTimes};
}
const idle=simulate(()=>({})),moving=simulate(()=>({vx:42}));
assert(idle.count>=4&&idle.count<=5,'idle sends only heartbeats '+idle.count);
assert(moving.count>=25&&moving.count<=27,'moving sends around 80ms cadence '+moving.count);
assert(moving.count>idle.count*4,'active and idle remain distinct cadence');
for(const fakeLatencyMs of [0,150,300,600]){
 // The same cadence decisions apply regardless of receipt latency; no test
 // claims to measure actual school Wi-Fi or browser round-trip time.
 const repeat=simulate(()=>({vx:42}),16,2000+fakeLatencyMs);
 assert(repeat.count>=moving.count,'simulated delayed duration remains paced');
}
console.log('PASS selective transport: 2v2 normal/draft share one 80ms active/500ms idle predicate; dedicated 1v1, host, action and RTDB paths preserved; deterministic + 0-600ms simulation');
