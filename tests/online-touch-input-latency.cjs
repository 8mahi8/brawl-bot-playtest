// Validate live source of touchscreen event queue diagnostics without trusting
// Playwright .tap() wall-clock duration as actual network or user input latency.
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'../online/ipad-squad-v2-lab.html'),'utf8');
const start=html.indexOf('function inputEventQueueDelay('),end=html.indexOf('let inputTiming=',start);
assert(start>0&&end>start&&end-start<900,'live Safari timestamp-normalizer is present');
const ctx={performance:{now:()=>2500,timeOrigin:1700000000000},Date:{now:()=>1700000002500},Math,Number};
vm.createContext(ctx);
vm.runInContext(html.slice(start,end)+'\nthis.age=inputEventQueueDelay;',ctx);
const age=ctx.age;
assert.equal(age({timeStamp:2420},2500),80,'monotonic Safari DOMHighResTimeStamp');
assert.equal(age({timeStamp:1700000002420},2500),80,'legacy Safari epoch Event.timeStamp');
assert.equal(age({timeStamp:2499.5},2500),.5,'submillisecond nonblocking delivery');
assert.equal(age({timeStamp:2501},2500),0,'small clock precision offset tolerated');
assert.equal(age({timeStamp:0},2500),null,'untrusted/zero timestamps ignored');
assert.equal(age({timeStamp:3000},2500),null,'future event cannot indicate positive queue delay');
assert.equal(age({timeStamp:1},2500),2499,'ancient-but-valid monotonic event age');
assert.equal(age({timeStamp:-1},2500),null,'invalid event age ignored');
assert.match(html,/inputTiming\.lastTouchShot=\{downQueueMs:/,'instrument actual touch-shot handler');
assert.match(html,/gestureMs:Math\.round\(handlerEntered-/,'measure touch gesture separately');
assert.match(html,/handlerMs:Math\.round\(\(performance\.now\(\)-handlerEntered\)/,'measure handler work separately');
assert.match(html,/submitted:actionSeq>beforeSeq/,'report whether input actually issued a shot');
assert.match(html,/skippedCoveredFrames\+\+/,'covered home and lobby avoid needless GPU draw');
console.log('PASS Safari monotonic/epoch input delay, touch-shot gesture/handler instrumentation and occluded Canvas guard');
