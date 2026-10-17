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
vm.runInContext(src+`
function renderGameHUD(){lastHudRenderAt=clock;hudCount++;}
function renderNetworkStatus(){statusCount++;}
this.poll=(at)=>{clock=at;periodicUiRefresh(at);};
this.stateUpdate=(at)=>{clock=at;renderGameHUD();};
`,scope);
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
// The live helper must preserve immediate state changes without repeated DOM mutations.
const writeStart=html.indexOf('function hudWriteValue('),writeEnd=html.indexOf('function renderGameHUD(){',writeStart);
assert(writeStart>0&&writeEnd>writeStart&&writeEnd-writeStart<900,'extract live HUD write gate');
const node={_text:'',_title:'',attrs:{},writes:0,attributeWrites:0,
 get textContent(){return this._text;},set textContent(v){this._text=v;this.writes++;},
 get title(){return this._title;},set title(v){this._title=v;this.writes++;},
 getAttribute(k){return this.attrs[k]??null;},
 setAttribute(k,v){this.attrs[k]=v;this.attributeWrites++;}};
const dom={presentationMetrics:{hudDomWrites:0,hudDomSkips:0}};
vm.createContext(dom);
vm.runInContext(html.slice(writeStart,writeEnd)+'this.writeValue=hudWriteValue;this.writeAttr=hudWriteAttribute;',dom);
dom.writeValue(node,'textContent','HP 100 / 100');
dom.writeValue(node,'textContent','HP 100 / 100');
dom.writeValue(node,'textContent','HP 90 / 100');
dom.writeValue(node,'title','GAD ガード');
dom.writeValue(node,'title','GAD ガード');
dom.writeAttr(node,'aria-label','ガジェット ガード');
dom.writeAttr(node,'aria-label','ガジェット ガード');
dom.writeAttr(node,'aria-label','ガジェット ダッシュ');
assert.equal(node.writes,3,'unchanged HP and ability labels avoid setter, HP changes immediately');
assert.equal(node.attributeWrites,2,'accessibility label updates on content change');
assert.equal(dom.presentationMetrics.hudDomWrites,5);
assert.equal(dom.presentationMetrics.hudDomSkips,3);
const hud=html.slice(html.indexOf('function renderGameHUD(){'),html.indexOf('async function registerPresence(){'));
for(const id of ['skillInfoText','myHP','myAmmo','myUlt','enemySummary','roundInfo','ultAction']){
 assert(hud.includes("hudWriteValue($('"+id+"'),'textContent',"),'live HUD still writes changed values: '+id);
}
assert(hud.includes("hudWriteValue(gad,'textContent',"),'GAD value always refreshed when changed');
assert(hud.includes("hudWriteAttribute(gad,'aria-label'"),'GAD accessible label preserved');
assert(hud.includes("hudWriteAttribute($('ultAction'),'aria-label'"),'ULT accessible label preserved');

const dynamicStyles={background:'',writes:0},dynamicButton={disabled:false,writes:0,_ready:false,
 classList:{contains(name){assert.equal(name,'ready');return dynamicButton._ready;},toggle(name,on){dynamicButton._ready=on;dynamicButton.writes++;}}};
Object.defineProperty(dynamicStyles,'background',{get(){return this._background||'';},set(v){this._background=v;this.writes++;}});
Object.defineProperty(dynamicButton,'disabled',{get(){return this._disabled||false;},set(v){this._disabled=v;this.writes++;}});
const classGate=html.slice(html.indexOf('function hudToggleClass('),html.indexOf('const hudReloadPaintPercent='));
assert(classGate.length<450&&classGate.includes('classList.contains'),'live class mutation guard');
vm.runInContext(classGate+'this.toggleClass=hudToggleClass;',dom);
const reloadBegin=html.indexOf('const hudReloadPaintPercent='),reloadEnd=html.indexOf('function renderGameHUD(){',reloadBegin);
assert(reloadBegin>0&&reloadEnd>reloadBegin&&reloadEnd-reloadBegin<650,'live reloader fill tracking');
vm.runInContext(html.slice(reloadBegin,reloadEnd)+'this.paintReload=hudPaintReloadBar;',dom);
const gradientEl={style:{set background(v){dynamicStyles.writes++;this._background=v;},get background(){return 'normalized: '+this._background;}}};
dom.paintReload(gradientEl,1);
dom.paintReload(gradientEl,1);
dom.paintReload(gradientEl,.95);
dom.writeValue(dynamicButton,'disabled',false);
dom.writeValue(dynamicButton,'disabled',true);
dom.writeValue(dynamicButton,'disabled',true);
dom.toggleClass(dynamicButton,'ready',true);
dom.toggleClass(dynamicButton,'ready',true);
dom.toggleClass(dynamicButton,'ready',false);
assert.equal(dynamicStyles.writes,2,'semantic fill cache skips equivalent backgrounds even if CSS getter normalizes values');
assert.equal(dynamicButton.writes,3,'unchanged ability disabled/ready state has no DOM mutations');
const changedHud=html.slice(html.indexOf('function renderGameHUD(){'),html.indexOf('async function registerPresence(){'));
assert(changedHud.includes('hudPaintReloadBar(el,fill);'),'reloader bars use semantic fill guard');
for(const id of ['ultAction','rematchBtn'])assert(changedHud.includes("hudWriteValue($('"+id+"'),'disabled',"),'disable state guarded for '+id);
assert(changedHud.includes("hudWriteValue(gad,'disabled',"),'gadget disabled guard');
assert(changedHud.includes("hudToggleClass($('ultAction'),'ready',"),'ULT readiness class guard');
console.log('PASS online HUD gate: immediate state snapshots, ≤250ms idle refresh, no redundant 100ms DOM updates, host tick unchanged');
