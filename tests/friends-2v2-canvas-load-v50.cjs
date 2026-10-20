'use strict';
// V5.0 guard: maintain four connected game/RTDB clients while changing only
// three guests' Canvas redraw behavior. Never apply V5.0 to default HTML.
const fs=require('node:fs'),assert=require('node:assert/strict'),vm=require('node:vm');
const {makeAll,spec}=require('../scripts/build-friends-online.cjs');
const runner=fs.readFileSync('tests/friends-2v2-live-motion-webkit-v43.cjs','utf8');
new vm.Script(runner,{filename:'test-runner'});
const required=[
 "process.env.BRAWL_V50_CANVAS_CPU_SPLIT==='1'",
 "process.env.BRAWL_V45_ISOLATE_CANVAS==='1'",
 "process.env.BRAWL_V46_BASELINE_ACTIONS==='1'",
 "process.env.BRAWL_V49_RENDER_PHASES==='1'",
 "v50Segments.push({",
 "segment:'fourCanvas'",
 "segment:'oneCanvas'",
 "segment:'resumedFourCanvas'",
 "window.__v49ShotFrames.stop()",
 "window.__v49ShotFrames.start()",
 "window.__v45CanvasQA.enabled=false",
 "window.__v45CanvasQA.enabled=true",
 "host.events.remoteShots",
 "firstFrames===s.events.remoteActions",
 "v50-"
];
for(const pattern of required)
 assert(runner.includes(pattern),'missing same-page V5.0 study guard: '+pattern);
assert.equal(runner.split('window.__v45CanvasQA.enabled=false').length-1,1,
 'disable exactly the three OTHER Canvas contexts');
assert.equal(runner.split('window.__v45CanvasQA.enabled=true').length-1,1,
 'restore their normal redraw gate exactly once');
const outputs=makeAll();
for(const [name,build]of Object.entries(outputs)){
 assert(!build.html.includes('V5.0'),'baseline staged HTML never contains experiment');
 assert(!build.html.includes('__v50'),'no experiment control in public HTML');
 assert(!fs.readFileSync(spec.modes[name].source,'utf8').includes('__v50'),
  'pinned source stays unchanged '+name);
}
// A controlled example proves a dramatic frame-wait difference is measurable
// while the per-action visual phase may be missing for a host-confirmed impact.
const probe=fs.readFileSync('tests/support/friends-2v2-render-phases-v49.js','utf8');
let now=1000;
const env={Map,Set,Object,Array,Number,Math,performance:{now:()=>now},window:{}};
vm.createContext(env);vm.runInContext(probe,env);
const qa=env.window.__v49ShotFrames;
const simulate=(phase,delta)=>{
 qa.start();qa.receive({eventId:'e-'+phase,type:'shot'});
 now+=delta;qa.frame();
 now+=2;qa.drawDecision(true);
 now+=4;qa.visual('e-'+phase,'early');
 return qa.stop();
};
const busy=simulate('four',100),light=simulate('one',20),resumed=simulate('again',95);
assert.deepEqual([busy,light,resumed].map(s=>s.stages.receiveToNextFrameMs.p95Ms),[100,20,95]);
assert.deepEqual([busy,light,resumed].map(s=>s.events.remoteActions),[1,1,1]);
assert(!JSON.stringify([busy,light,resumed]).includes('e-four'),
 'no action IDs in the report');
console.log('PASS V5.0 test-only 4→1→4 render-load and per-segment phase-sampler contract; no default/public/duel mode changes');
