'use strict';
// V3.9 deterministic QA: per-stage local timing only, no realtime writes.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {makeAll,spec,patchSquadActionLagProbe}=require('../scripts/build-friends-online.cjs');
const src=fs.readFileSync(spec.modules.squadActionLagProbeV39,'utf8');
assert(!/\b(?:firebase|db|room)\s*\.\s*(?:ref|set|update|push|transaction)\s*\(|\bfetch\s*\(|\bXMLHttpRequest\b|\blocalStorage\b|\bsessionStorage\b/.test(src),
 'local-only probe cannot access persistent data or network');
const result=makeAll(),marker='window.__brawlLagV39QA=Object.freeze(';
for(const name of ['normal.2vs2','draft.2vs2']){
 const html=result[name].html,legacy=fs.readFileSync(spec.modes[name].source,'utf8');
 assert.equal(html.split(marker).length-1,1,'one V3.9 QA module for '+name);
 assert(html.includes(src.trimEnd()),'V3.9 source byte-for-byte in '+name);
 assert(!legacy.includes(marker),'old HTML preserved '+name);
 assert(html.includes("window.__brawlLagV39QA.tap('receive',a,serverNow()-a.at);"),
  'action arrival measured '+name);
 assert(html.includes("window.__brawlLagV39QA.tap('hostQueued',a);"),
  'host queue measured '+name);
 assert(html.includes("window.__brawlLagV39QA.tap('hostBegin',__a);"),
  'host batch measured '+name);
 assert(html.includes('window.__brawlLagV39QA.snapshot(game);'),
  'authoritative game receipt measured '+name);
 assert(html.includes("window.__brawlLagV39QA.tap('visual',a);"),
  'early action visual measured '+name);
 assert(html.includes("window.__brawlLagV39QA.tap('visual',{eventId:bullet.fireId});"),
  'authoritative fallback visual measured '+name);
 assert.throws(()=>patchSquadActionLagProbe(html,src,name),/cannot be inserted twice/);
}
for(const name of ['normal.1vs1','draft.1vs1'])
 assert(!result[name].html.includes(marker),'V3.9 cannot affect 1v1 '+name);
let now=1000;const env={
 window:{},performance:{now:()=>now},
 game:{phase:'playing',matchId:'SECRET_ROOM_NAME',round:1,usedActions:{}},
 Math,Map,Object,Array,Number,Date,Error
};
vm.createContext(env);vm.runInContext(src,env);
const qa=env.window.__brawlLagV39QA, id='SECRET_PERSON_8213_FIRE_ID';
assert(qa && !qa.status().running,'opt-in: should not start automatically');
assert.deepEqual(Object.keys(qa.report().stages).sort(),
 ['hostQueueWaitMs','hostTransactionMs','receiveToFirstVisualMs',
  'receiveToReceiptMs','remoteActionEstimatedAgeMs','sendToReceiptMs','writeAckMs'].sort());
qa.tap('send',{eventId:id});assert.equal(qa.status().tracked,0,'disabled by default');
qa.start();
qa.tap('send',{eventId:id});
now=1035;qa.tap('ack',{eventId:id});
assert.equal(qa.report().stages.writeAckMs.p50Ms,35);
const remote='SECRET_REMOTE_PLAYER_SHOT';
now=1050;qa.tap('receive',{eventId:remote},125);
now=1060;qa.tap('hostQueued',{eventId:remote});
now=1075;qa.tap('hostBegin',{eventId:remote});
now=1082;qa.tap('hostTxn',null,{durationMs:22,committed:true});
now=1090;qa.tap('visual',{eventId:remote});
now=1120;
env.game.usedActions[id]={status:'accepted'};
env.game.usedActions[remote]={status:'accepted'};
qa.snapshot(env.game);
const out=qa.report();
assert.equal(out.stages.hostTransactionMs.p50Ms,22);
assert.equal(out.stages.hostQueueWaitMs.p50Ms,15);
assert.equal(out.stages.remoteActionEstimatedAgeMs.p50Ms,125);
assert.equal(out.stages.receiveToFirstVisualMs.p50Ms,40);
assert.equal(out.stages.receiveToReceiptMs.p50Ms,70);
assert.equal(out.stages.sendToReceiptMs.p50Ms,120);
assert.equal(out.events.authoritativeReceipts,2);
assert.equal(out.events.hostCommitted,1);
assert.equal(out.events.hostAborted,0);
assert(!('pingMs' in out.stages),'do not mislabel estimated age as RTT');
assert(!JSON.stringify(out).includes('SECRET'),'no action IDs, match IDs or player IDs in report');
now=1140;qa.tap('visual',{eventId:'visual-first'});
now=1150;qa.tap('receive',{eventId:'visual-first'},220);
assert.equal(qa.report().events.visualBeforeAction,1);
assert.equal(qa.report().stages.receiveToFirstVisualMs.samples,2);
assert.equal(qa.report().stages.receiveToFirstVisualMs.p50Ms,-10,
 'arrival after visual is observed as a negative same-device interval');
assert.equal(qa.stop().running,false);
assert.equal(qa.status().tracked,0,'finished session erases raw event keys');
env.game.round=2;now=2100;qa.start();
qa.tap('receive',{eventId:'fresh'},200);
now=2200;env.game.round=3;qa.tap('receive',{eventId:'different'},230);
assert.equal(qa.report().events.remoteShots,1,'round reset discards prior samples');
qa.reset();
assert.equal(qa.report().hasSamples,false);
console.log('PASS V3.9 opt-in action arrival / visual / Firebase ack / host transaction / receipt stages, 4-mode isolation, no writes/identifiers or RTT mislabel');
