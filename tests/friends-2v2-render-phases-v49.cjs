'use strict';
// V4.9 deterministic per-device ACTION → rAF → Canvas phase contract.
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const {makeAll,spec,validate}=require('../scripts/build-friends-online.cjs');
const {instrumentV49}=require('./support/friends-2v2-render-patch-v49.cjs');
const probe=fs.readFileSync('tests/support/friends-2v2-render-phases-v49.js','utf8');
assert(!/firebase\.|\.transaction\(|\.set\(|fetch\(|localStorage|sessionStorage/.test(probe),
 'probe never writes to Firebase, fetches, or persistent storage');
const built=makeAll();
for(const name of ['normal.1vs1','draft.1vs1'])
 assert(!built[name].html.includes('__v49ShotFrames'),'duel isolated');
for(const name of ['normal.2vs2','draft.2vs2']){
 const html=instrumentV49(built[name].html,probe);
 validate(html,name,built[name].mode);
 assert.equal(html.split('window.__v49ShotFrames=Object.freeze(').length-1,1,'single probe '+name);
 assert(html.includes("window.__v49ShotFrames.visual(a.eventId,'early');"),
  'early visual phase recorded '+name);
 assert(html.includes("window.__v49ShotFrames.visual(bullet.fireId,'authoritative');"),
  'authoritative fallback phase recorded '+name);
 assert.throws(()=>instrumentV49(html,probe),/cannot inject twice/,'no double instrumentation');
 assert(!fs.readFileSync(spec.modes[name].source,'utf8').includes('__v49ShotFrames'),
  'pinned source is untouched '+name);
 assert(!built[name].html.includes('__v49ShotFrames'),'default builder output unchanged '+name);
}
let clock=1000;
const state={window:{},performance:{now:()=>clock},Map,Math,Number,Object,Set,Array};
vm.createContext(state);vm.runInContext(probe,state);
const qa=state.window.__v49ShotFrames;
assert(qa&&!qa.status().running,'sampler opt-in');
qa.receive({eventId:'SECRET_EVENT_123',type:'shot'});
assert.equal(qa.report().events.remoteActions,0,'no automatic capture');
qa.start();
qa.receive({eventId:'SECRET_EVENT_123',type:'shot'});
qa.receive({eventId:'SECRET_EVENT_123',type:'shot'});
qa.receive({eventId:'ignored',type:'move'});
assert.equal(qa.report().events.remoteActions,1,'one tracked remote shot');
clock=1005;qa.frame();
clock=1010;assert.equal(qa.drawDecision(false),false,'skipped canvas remains skipped');
clock=1020;qa.frame();
clock=1021;assert.equal(qa.drawDecision(true),true,'actual draw behavior unchanged');
clock=1024;qa.visual('SECRET_EVENT_123','early');
let r=qa.report();
assert.equal(r.stages.receiveToNextFrameMs.p50Ms,5,'ACTION to first frame');
assert.equal(r.stages.receiveToFirstCanvasDrawMs.p50Ms,21,'Canvas draw start');
assert.equal(r.stages.nextFrameToFirstDrawMs.p50Ms,16,'first frame to first eligible draw');
assert.equal(r.stages.receiveToFirstVisualMs.p50Ms,24,'ACTION to first bullet visual');
assert.equal(r.stages.nextFrameToFirstVisualMs.p50Ms,19,'first frame to bullet draw');
assert.equal(r.events.skippedDrawDecisionsWhilePending,1,'a pending shot faced a skip');
assert.equal(r.events.firstVisuals,1,'visual once even if host fallback follows');
qa.visual('SECRET_EVENT_123','authoritative');
assert.equal(qa.report().events.firstVisuals,1,'deduplicated');
clock=1030;qa.receive({eventId:'SECRET_OTHER',type:'shot'});
r=qa.stop();
assert.equal(r.events.remoteActions,2);
assert.equal(r.events.unpaintedActions,1,'no visual must be reported rather than invented');
assert(!JSON.stringify(r).includes('SECRET'),'no action IDs exported');
assert.equal(qa.status().pending,0,'tracked per-action IDs cleared after stop');
console.log('PASS V4.9 2vs2 stage-only receive/rAF/draw decision/early and authoritative visual capture; no ping or per-action export; 1vs1/default/pinned pages unchanged');
