'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const {spec,makeAll,patchSquadHudV45}=require('../scripts/build-friends-online.cjs');
const source=fs.readFileSync(spec.modules.squadHudV45,'utf8');
assert(source.includes('requestAnimationFrame('),'HUD should coalesce at the presentation boundary');
assert(!/\.transaction\s*\(|\.child\s*\(|\.set\s*\(|\bfetch\s*\(/.test(source),
 'UI batching must be isolated from Firebase and combat');
const variants=makeAll(),base=makeAll(null,null,null,null,null,true,true,false);
for(const name of ['normal.2vs2','draft.2vs2']){
 const html=variants[name].html;
 assert.equal(html.split('window.__brawlHudV45QA=()=>').length-1,1,'single V4.5 instrumentation');
 assert(html.includes("checkPaused();requestGameHudRefreshV45(enteredGame||game.phase!=='playing'||paused);"),
  'urgent round transitions must render synchronously');
 assert(html.includes('function renderGameHUDV45Base(){'));
 assert(html.includes('function renderGameHUD(){'));
 assert.equal(base[name].html.includes('window.__brawlHudV45QA=()=>'),false,
  'baseline V4.4 output remains obtainable without V4.5');
 assert.throws(()=>patchSquadHudV45(html,source,name),/already patched/);
}
for(const name of ['normal.1vs1','draft.1vs1'])
 assert(!variants[name].html.includes('__brawlHudV45QA'),'1vs1 logic remains untouched');
let clock=0,room={label:'r'},renders=0;
const frames=[],sandbox={
 Math,Number,Object,window:{},room,roomGeneration:1,scene:'game',
 document:{hidden:false},pageSuspended:false,
 performance:{now:()=>clock++},
 requestAnimationFrame:fn=>{frames.push(fn);},
 renderGameHUDV45Base:()=>{renders++;return 'ok';}
};
vm.createContext(sandbox);vm.runInContext(source,sandbox);
const call=urgent=>vm.runInContext('requestGameHudRefreshV45('+!!urgent+')',sandbox);
const qa=()=>JSON.parse(JSON.stringify(sandbox.window.__brawlHudV45QA()));
assert.equal(call(false),undefined);
call(false);call(false);call(false);
assert.equal(frames.length,1,'four game snapshots in a frame generate one HUD draw');
assert.equal(renders,0,'combat callbacks never blocked awaiting HUD');
assert.equal(qa().coalesced,3);
clock+=11;frames.shift()();
assert.equal(renders,1);
assert.equal(qa().flushed,1);
assert.equal(qa().renderCalls,1);
assert.equal(qa().pending,false);
// When a game over / pause state is reached, do not defer the banner/HUD.
call(false);const stale=frames.shift();
call(true);
assert.equal(renders,2,'urgent HUD must be immediately up to date');
stale();
assert.equal(renders,2,'queued old HUD cannot overwrite match transition');
// Periodic 250ms refresh is still synchronous and must cancel queued RAF.
call(false);const old=frames.shift();
vm.runInContext('renderGameHUD()',sandbox);old();
assert.equal(renders,3,'periodic refresh cannot cause duplicate next-frame HUD');
// A room-leave/reattach must cancel a pending render from a prior match.
call(false);const outdated=frames.shift();
sandbox.room={label:'new-room'};sandbox.roomGeneration++;
outdated();
assert.equal(renders,3,'old room frame must never paint the new match');
assert.equal(qa().pending,false);
// Background / BFCache callbacks remain immediate, never wait on rAF.
sandbox.document.hidden=true;call(false);assert.equal(renders,4);
sandbox.document.hidden=false;sandbox.pageSuspended=true;
call(false);assert.equal(renders,5);
assert.equal(qa().queued,4);
assert(qa().invalidated>=3);
const safe=JSON.stringify(qa());
assert(!safe.includes('new-room')&&!safe.includes('label'),'anonymous telemetry must have no room IDs');
console.log('PASS V4.5 2v2 HUD coalescing / direct periodic / urgent pause / reconnect generation / background / 1v1 isolation');
