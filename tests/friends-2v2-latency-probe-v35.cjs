// V3.5 opt-in sampler: local counters only, no networking, no IDs in report.
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {spec,makeAll,patchSquadLatencyProbe}=require('../scripts/build-friends-online.cjs');
const root=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const src=read(spec.modules.squadLatencyProbe);
assert(!/\b(?:room|db|firebase)\s*\.\s*(?:ref|set|update|push|transaction)\s*\(|\bfetch\s*\(|\bXMLHttpRequest\b|\blocalStorage\s*\.|\bsessionStorage\s*\./.test(src),
 'diagnostics must not write Firebase, local storage, or transmit data');
const normal=makeAll(),marker='window.__brawlLatencyV35QA=Object.freeze(';
for(const name of ['normal.2vs2','draft.2vs2']){
 const input=read(spec.modes[name].source),html=normal[name].html;
 assert(!input.includes(marker),'frozen HTML has no probe');
 assert.equal(html.split(marker).length-1,1,'one V3.5 sampler in staging only');
 assert(html.includes(src.trimEnd()),'runtime source preserved verbatim');
 assert.throws(()=>patchSquadLatencyProbe(html,src,name),/already inserted/);
}
for(const name of ['normal.1vs1','draft.1vs1']){
 assert(!normal[name].html.includes(marker),'duels must not receive 2v2 metrics');
 assert(!spec.modes[name].modules.includes('squadLatencyProbe'));
}
const changed=src.replace('const MAX_POINTS=480','const MAX_POINTS=479');
assert.notEqual(changed,src);
const altered=makeAll(null,null,null,null,changed);
for(const name of ['normal.2vs2','draft.2vs2']){
 assert.notEqual(normal[name].html,altered[name].html,'future shared changes reach '+name);
 assert(altered[name].html.includes('const MAX_POINTS=479'));
}
for(const name of ['normal.1vs1','draft.1vs1'])
 assert.equal(normal[name].html,altered[name].html,'duel unaffected by 2v2 diagnostic change');

let now=1000,period=0,tick=null,timers=0,cancellations=0;
const env={
 window:{},performance:{now:()=>now},
 setInterval:(fn,ms)=>{assert.equal(tick,null,'one timer only');tick=fn;period=ms;timers++;return timers;},
 clearInterval:()=>{tick=null;cancellations++;},
 game:{phase:'playing',round:1,matchId:'PRIVATE-ROOM-ID-NEVER-EXPORT'},
 connected:true,
 presentationMetrics:{positionWrites:10,positionIdleSkips:4,hudRenders:30},
 workTiming:{frameSamples:50,frameGapOver100:1,gameSnapshots:10,positionSnapshots:20,
  nonDrawTotalMs:35,timerPulses:30,frameGapMaxMs:150},
 drawTiming:{frames:45,totalDrawMs:80,maxDrawMs:12},
 earlyShotStats:{incoming:4,shown:5,bomber:1,hostHandoffs:1},
 inputTiming:{touchShots:2,lastTouchShot:{upQueueMs:8,handlerMs:2.5,canvasDrawSubmittedMs:14}},
 snapshotGap:120,Number,Math,Object,Date,Error
};
vm.createContext(env);vm.runInContext(src,env);
const qa=env.window.__brawlLatencyV35QA;
assert(qa&&typeof qa.start==='function');
assert.equal(timers,0,'no timer created on page load');
assert.equal(qa.report().ready,false);
assert.throws(()=>qa.start(0),/interval/);
assert.equal(qa.start(250).samples,1);
assert.equal(period,250);
assert.equal(timers,1);
assert.equal(qa.status().running,true);
now=2000;Object.assign(env.workTiming,{frameSamples:110,frameGapOver100:3,gameSnapshots:22,positionSnapshots:54,nonDrawTotalMs:68,timerPulses:49});
Object.assign(env.drawTiming,{frames:100,totalDrawMs:220,maxDrawMs:14});
Object.assign(env.earlyShotStats,{incoming:7,shown:14,bomber:2,hostHandoffs:2});
Object.assign(env.presentationMetrics,{positionWrites:16,positionIdleSkips:6,hudRenders:45});
env.inputTiming.touchShots=3;env.snapshotGap=95;
tick();const r=qa.report();
assert.equal(r.ready,true);assert.equal(r.windowSeconds,1);
assert.equal(r.projectile.receivedActionCount,3);
assert.equal(r.projectile.previewDrawOperations,9);
assert.equal(r.projectile.hostVisualHandoffCount,1);
assert.equal(r.traffic.gameSnapshotsPerSecond,12);
assert.equal(r.traffic.positionCallbacksPerSecond,34);
assert.equal(r.presentation.framesPerSecond,60);
assert.equal(r.presentation.averageCanvasDrawMs,2.5);
assert.equal(r.presentation.frameGapOver100msPercent,3.3);
assert.equal(r.presentation.sessionMaxCanvasDrawMs,14);
assert.equal(r.input.touchShotCount,1);
assert.equal(r.input.latestHandlerToCanvasSubmissionMs,14);
assert(!JSON.stringify(r).includes('PRIVATE-ROOM'),'report never exports room ID');
assert(!('pingMs' in r.traffic),'do not falsely claim measurement of network ping');
assert.equal(qa.stop().running,false);
assert.equal(tick,null,'stop removes timer');
assert.equal(qa.capture().captured,false,'no sampling when stopped');
qa.start(100);assert.equal(qa.status().samples,1);
env.game.round=2;now=3000;
assert.equal(qa.capture().samples,1,'round changes clear older samples');
for(let i=0;i<600;i++){now+=100;qa.capture();}
assert.equal(qa.status().samples,480,'bounded ring buffer');
qa.reset();assert.equal(qa.status().samples,0);assert.equal(tick,null);
env.connected=false;qa.start();assert.equal(qa.status().samples,0,'offline data ignored');qa.stop();
assert(cancellations>=3);
console.log('PASS V3.5 opt-in local lag sampler: source isolation, 4-mode staging, action/paint/traffic rates, no ping claims, no identifiers, bounded 480-point storage, match reset and no default timers');
