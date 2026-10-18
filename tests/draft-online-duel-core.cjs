// Tactical Draft online 1v1: pure transactional reducer + standalone HTML contract.
// No Firebase/network access. Real two-browser emulator test is separate.
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const source=fs.readFileSync(path.join(root,'draft/duel-online-prototype.inc.js'),'utf8');
const html=fs.readFileSync(path.join(root,'online/draft-duel-online-lab.html'),'utf8');
assert(html.includes(source),'single inlined source must match reducer file');
for(const [i,m] of [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].entries())
  if(m[1].trim())new vm.Script(m[1],{filename:'draft-online.html#'+i});
const api=vm.runInNewContext(source+'\n({netDraftNewMatch,netDraftOffer,netDraftBegin,netDraftPick,netDraftNextRound,netDraftHit,netDraftMotion})',
  {structuredClone}, {timeout:1000});
const {netDraftNewMatch,netDraftBegin,netDraftPick,netDraftNextRound,netDraftHit,netDraftMotion}=api;
function asPlain(x){return JSON.parse(JSON.stringify(x))}
let g={phase:'playing',round:1,loser:'',scores:{host:0,guest:0},
  chars:{host:'gunner',guest:'sniper'},hp:{host:100,guest:70},
  draft:netDraftNextRound(netDraftNewMatch(),1000)};
assert.deepEqual(asPlain(g.draft.owned),{host:[],guest:[]},'no cards in round one');
assert.equal(netDraftBegin(g,'12345'),null,'cannot draft mid-round');
let previousOffer=null;
for(let round=1;round<=4;round++){
 const winner=round%2?'host':'guest',loser=winner==='host'?'guest':'host';
 g={...g,phase:'round_end',round,loser,
   scores:{host:Math.ceil(round/2),guest:Math.floor(round/2)}};
 const d=netDraftBegin(g,'12345');
 assert(d&&d.phase==='draft'&&d.draft.order[0]===winner,'winner must select first');
 assert.equal(d.draft.offered.length,4,'four shared choices');
 assert.equal(new Set(d.draft.offered).size,4,'unique offer');
 assert.equal(netDraftBegin(d,'12345'),null,'only round_end begins a draft');
 assert.equal(netDraftPick(d,loser,d.draft.offered[0]),null,'loser cannot jump ahead');
 assert.equal(netDraftPick(d,winner,'bogus'),null,'unknown card denied');
 const before=JSON.stringify(d),owned=d.draft.owned[winner];
 const pick=d.draft.offered.find(id=>!owned.includes(id));
 const r=owned.length>=3?owned[0]:null;
 let n=netDraftPick(d,winner,pick,r);
 assert(n&&n.phase==='draft','one pick is not a full draft');
 assert.equal(JSON.stringify(d),before,'transaction helper must not mutate input');
 assert.equal(netDraftPick(n,winner,pick,null),null,'cannot double-select');
 const taken=n.draft.taken;
 const second=n.draft.offered.find(id=>!taken.includes(id)&&!n.draft.owned[loser].includes(id));
 assert(second,'loser must have an available counterpick');
 const loseOwned=n.draft.owned[loser];
 if(loseOwned.length>=3)assert.equal(netDraftPick(n,loser,second),null,'explicit replacement required');
 n=netDraftPick(n,loser,second,loseOwned.length>=3?loseOwned[0]:null);
 assert(n&&n.phase==='round_end'&&n.draft.complete,'both picks finish draft');
 assert.equal(netDraftPick(n,loser,second),null,'completed round cannot be picked again');
 for(const side of ['host','guest']){
   assert.equal(n.draft.owned[side].length,Math.min(round,3),'up to three persistent cards');
   assert.equal(new Set(n.draft.owned[side]).size,n.draft.owned[side].length,'no duplicates in inventory');
 }
 assert.notEqual(JSON.stringify(n.draft.offered),JSON.stringify(previousOffer),'offer rotates across rounds');
 previousOffer=n.draft.offered;
 g={...n,phase:'playing',round:round+1,draft:netDraftNextRound(n.draft,2000+round*1000)};
 assert.equal(g.draft.complete,false);
 assert.deepEqual(asPlain(g.draft.owned),asPlain(n.draft.owned),'inventory persists between rounds');
}
g={...g,phase:'match_end',scores:{host:3,guest:2},loser:'guest'};
assert.equal(netDraftBegin(g,'12345'),null,'finished match cannot offer more cards');
let hitState=netDraftNewMatch();
hitState.owned.host=['finisher','followthrough','hit_stride'];
hitState.owned.guest=['opening_guard','clutch_armor'];
hitState.lastDamage.guest=1000;
const first=netDraftHit(hitState,{host:'gunner',guest:'sniper'},{host:100,guest:70},'guest',10,'host','normal',8000);
assert.equal(first.amount,3,'opening guard prevents 7 first-hit damage');
assert.equal(first.draft.hitStrideUntil.host,9800,'on-hit speed buff credited to attacker');
assert.equal(hitState.cooldown.guest.opening_guard,undefined,'input is immutable');
const second=netDraftHit(first.draft,{host:'gunner',guest:'sniper'},{host:100,guest:22},'guest',10,'host','normal',9000);
assert.equal(second.amount,Math.round((10+7)*(1-.08)),'finisher/followthrough stack at +7, armor 8%');
assert.equal(second.draft.cooldown.host.finisher,17000);
const denied=netDraftHit(second.draft,{host:'gunner',guest:'sniper'},{host:100,guest:15},'guest',10,'host','normal',9500);
assert(denied.amount<=10,'cooldowns cannot re-trigger immediately');
const recoil=netDraftNewMatch();
recoil.owned.host=['recoil_shot'];
const recoilHit=netDraftHit(recoil,{host:'gunner',guest:'gunner'},
  {host:100,guest:100},'guest',10,'host','normal',9000);
assert.equal(recoilHit.amount,11,'host verified +10% applies to normal Gunner damage');
const recoilULT=netDraftHit(recoil,{host:'gunner',guest:'gunner'},
  {host:100,guest:100},'guest',10,'host','effect',9000);
assert.equal(recoilULT.amount,10,'recoil card cannot buff ULT or GAD damage');
assert.equal(netDraftMotion(0,0,0,0,1/60,102,true),false);
assert.equal(netDraftMotion(0,0,2,0,1/60,102,true),true);
assert.equal(netDraftMotion(0,0,2,0,1/60,102,false),false);
assert(html.includes("roomsDraft1v1/'+code"),'isolated room root');
assert(html.includes("PROTOCOL = 1031"),'draft protocol differs from normal rooms');
assert(html.includes("db.useEmulator('127.0.0.1',9000)"),'must target local RTDB only');
assert(html.includes("['localhost','127.0.0.1'].includes(location.hostname)"),'reject GitHub Pages / production hosts');
assert(!html.includes("db.ref('rooms/'+code)"),'normal rooms must be untouched');
assert(!fs.existsSync(path.join(root,'sites/BRAWL_DRAFT_1vs1.html')),'no public release HTML');
console.log('PASS online draft core: four sequential drafts, winner first, atomic picks, cap, combat modifiers, production isolation');
