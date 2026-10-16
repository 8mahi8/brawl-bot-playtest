// Exercise the actual 2vs2 periodic HUD gate independently of Firebase.
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'../online/ipad-squad-v2-lab.html'),'utf8');
const a=html.indexOf('const PERIODIC_HUD_MAX_AGE_MS='),z=html.indexOf('// Read-only performance diagnostics;',a);
assert(a>0&&z>a&&z-a<1800,'exact live HUD scheduling gate');
const src=html.slice(a,z);
const scope={scene:'game',performance:{now:()=>scope.clock},clock:0,
 presentationMetrics:{periodicHudRenders:0,skippedPeriodicHud:0},hudCount:0,statusCount:0};
vm.createContext(scope);
vm.runInContext(src+\`
function renderGameHUD(){lastHudRenderAt=clock;hudCount++;}
function renderNetworkStatus(){statusCount++;}
this.poll=periodicUiRefresh;
this.stateUpdate=(at)=>{clock=at;renderGameHUD();};
\`,scope);
scope.poll(0);
assert.equal(scope.hudCount,1,'first game HUD always appears');
assert.equal(scope.statusCount,1,'first network status appears');
scope.poll(100);scope.poll(200);
assert.equal(scope.hudCount,1,'duplicate 100ms HUD paint is skipped');
assert.equal(scope.statusCount,1,'status text no longer churns at 100ms');
scope.poll(300);
assert.equal(scope.hudCount,2,'HUD must refresh by 250ms when no new game snapshots arrive');
assert.equal(scope.statusCount,2);
scope.stateUpdate(320);
scope.poll(400);scope.poll(500);
assert.equal(scope.hudCount,3,'new authoritative game snapshot refreshes HUD promptly');
scope.poll(600);
assert.equal(scope.hudCount,4,'periodic HUD resumes when snapshot stream is idle');
assert.equal(scope.presentationMetrics.skippedPeriodicHud,4);
const count=scope.hudCount;
scope.scene='lobby';scope.poll(900);
assert.equal(scope.hudCount,count,'lobby timer must not write hidden battle HUD');
assert.match(html,/onlineTimer=setInterval\(.*processCombatTick\(\).*periodicUiRefresh\(performance\.now\(\)\)/s,
 '100ms host combat work remains unaffected');
assert.match(html,/reconcileRoomView\(\).*gadgetReceipts\(\)/,
 'game snapshots still reconcile immediately');
console.log('PASS online HUD gate: immediate state snapshots, ≤250ms idle refresh, no redundant 100ms DOM updates, host tick unchanged');
