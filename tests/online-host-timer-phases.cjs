// Source-extracted 2vs2 timer profiler and pause HUD regression.
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'../online/ipad-squad-v2-lab.html'),'utf8');
const phaseStart=html.indexOf('const TIMER_PHASES=');
const phaseEnd=html.indexOf('function periodicUiRefresh(',phaseStart);
assert(phaseStart>0&&phaseEnd>phaseStart&&phaseEnd-phaseStart<1300,'actual phase tracer source');
const pauseStart=html.indexOf('function checkPaused(){');
const pauseEnd=html.indexOf('// PAUSED is a shared database phase.',pauseStart);
assert(pauseStart>0&&pauseEnd>pauseStart&&pauseEnd-pauseStart<2600,'actual pause-banner update source');
const phases={performance:{now:()=>phaseTime}};
let phaseTime=0;
vm.createContext(phases);
vm.runInContext(html.slice(phaseStart,phaseEnd)+
 '\\nthis.measure=measureTimerPhase;this.metrics=()=>timerPhaseTiming;',phases);
const result=phases.measure('actions',()=>{phaseTime=12;return 'fast';});
assert.equal(result,'fast','tracing must preserve callback return');
assert.equal(phases.metrics().actions.calls,1);
assert.equal(phases.metrics().actions.totalMs,12);
assert.equal(phases.metrics().hostCombat.calls,0);
assert.throws(()=>phases.measure('pauseCheck',()=>{phaseTime=21;throw Error('sentinel');}),/sentinel/,
 'tracer must propagate exceptions without changing match logic');
assert.equal(phases.metrics().pauseCheck.calls,1,'timer phase measured even after exception');
const hidden=new Set(['hidden']);
const banner={textContent:'',classList:{
 contains(x){return hidden.has(x);},
 toggle(x,enabled){if(enabled)hidden.add(x);else hidden.delete(x);}
}};
const flags={connected:true};
let fakeNow=10000,reset=0;
const p={scene:'game',game:{phase:'playing',matchId:'m',round:1},lobby:{},myId:'me',paused:false,
 localPauseKey:'',PAUSE_LIMIT:30000,
 allPresent:()=>flags.connected,serverNow:()=>fakeNow,resetTransientCombat:()=>{reset++;},
 $:id=>{assert.equal(id,'pauseBanner');return banner;}};
vm.createContext(p);
vm.runInContext('let pauseBannerMetrics={writes:0,skips:0};'+html.slice(pauseStart,pauseEnd)+
 '\\nthis.verify=checkPaused;this.metrics=()=>pauseBannerMetrics;',p);
p.verify();p.verify();p.verify();
assert.deepEqual([...hidden],['hidden'],'playing scene has hidden pause banner');
assert.equal(p.metrics().writes,0,'playing timer never churns pause banner DOM');
assert.equal(p.metrics().skips,3);
flags.connected=false;p.verify();
assert.equal(reset,1,'first disconnect resets predicted combat visuals');
assert(!hidden.has('hidden'),'connection loss announces pause immediately');
assert.equal(p.metrics().writes,1);
p.verify();assert.equal(p.metrics().writes,1,'same displayed second does not repaint');
fakeNow=11000;p.verify();
assert.equal(p.metrics().writes,2,'countdown updates on new second');
flags.connected=true;p.game={...p.game,phase:'playing'};p.verify();
assert.equal(p.paused,false,'reconnection resumes local controls');
assert(hidden.has('hidden'),'resume immediately hides pause banner');
p.game={...p.game,phase:'round_end'};p.verify();
assert(!hidden.has('hidden'),'round-end banner remains visible');
p.game={...p.game,phase:'aborted'};p.verify();
assert(banner.textContent.includes('試合中止'),'aborted match still reports failure');
assert.match(html,/onlineTimer=setInterval\(\(\)=>\{[^]*measureTimerPhase\('actions',\(\)=>drainActions\(\)\)[^]*measureTimerPhase\('hostCombat',[^]*\},100\);/,
 'real 100ms timer retains action processing and host combat work');
console.log('PASS 2vs2 host timer phase measurements, exception propagation, pause banner de-dup, countdown, resume and abort');
