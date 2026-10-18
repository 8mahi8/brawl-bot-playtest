// Contract checks for BRAWL's separate standard/draft Google Sites variants.
// Runs without browsers, Firebase SDK, credentials or production writes.
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..');
const manifest=JSON.parse(fs.readFileSync(path.join(root,'draft/variant-manifest.json'),'utf8'));
const {rosterFor,draftOrder,beginDraft,selectCard}=require('../draft/strategy-core.cjs');
const entries=Object.entries(manifest.pages);
assert.equal(entries.length,4,'exactly four Google Sites variants');
assert.deepEqual(entries.map(([k])=>k),['standard.1vs1','standard.2vs2','draft.1vs1','draft.2vs2']);
assert.equal(new Set(entries.map(([,v])=>v.releaseHtml)).size,4,'release HTML paths cannot alias');
assert.equal(new Set(entries.map(([,v])=>v.labHtml)).size,4,'lab HTML paths cannot alias');
assert.equal(new Set(entries.map(([,v])=>v.roomRoot)).size,4,'no standard/draft Firebase room collision');
assert.equal(new Set(entries.map(([,v])=>v.protocol)).size,4,'protocols independently versioned');
const emulator=JSON.parse(fs.readFileSync(path.join(root,'network/emulator/ONLINE_E2E_TEST_ONLY.rules.json'),'utf8'));
for(const [name,page] of entries){
 assert(page.roomRoot.match(/^[a-zA-Z][a-zA-Z0-9]*$/),'safe room root '+name);
 if(name.startsWith('standard.')){
  assert.equal(page.status,'live');
  assert(fs.existsSync(path.join(root,page.releaseHtml)),'approved normal release exists');
  assert(fs.existsSync(path.join(root,page.labHtml)),'approved normal dev page exists');
  assert(emulator.rules[page.roomRoot], 'existing local emulator permits normal rooms');
 }else{
  assert.equal(page.status,'reserved','draft is not ready for public release');
  assert(!fs.existsSync(path.join(root,page.releaseHtml)),'unapproved public draft HTML must not appear');
  assert(page.onlineLabStatus==='local_emulator_only_not_public','draft lab is not published or cloud connected');
  assert(fs.existsSync(path.join(root,page.onlineLabHtml)),'dedicated online draft lab exists');
  const code=fs.readFileSync(path.join(root,page.onlineLabHtml),'utf8');
  assert(code.includes("db.useEmulator('127.0.0.1',9000)"),'draft lab is pinned to local emulator');
  assert(code.includes("['localhost','127.0.0.1'].includes(location.hostname)"),'draft cloud connection blocked off loopback');

  assert(!emulator.rules[page.roomRoot], 'local emulator must default-deny unimplemented draft room roots');
 }
}
assert.equal(manifest.draftDefaults.winsToWin,3);
assert.equal(manifest.draftDefaults.initialRoundHasCards,false);
assert.equal(manifest.draftDefaults.retainCardsUntilMatchEnd,true);
assert.equal(manifest.draftDefaults.winnerPicksFirst,true);
assert.equal(manifest.hotZoneDraft.multiRound,true);
assert.equal(manifest.hotZoneDraft.captureTargetMs,null,'HOT ZONE tuning is not approved yet');
function assertThrows(fn,pattern){assert.throws(fn,pattern);}
const a=rosterFor('1vs1'),b=rosterFor('2vs2');
assert.deepEqual(draftOrder({roster:a,winner:'host',draftIndex:0}),['host','guest']);
assert.deepEqual(draftOrder({roster:a,winner:'guest',draftIndex:1}),['guest','host']);
assert.deepEqual(draftOrder({roster:b,winner:'blue',draftIndex:0}),['blue1','red1','red2','blue2']);
assert.deepEqual(draftOrder({roster:b,winner:'blue',draftIndex:1}),['blue2','red2','red1','blue1']);
assert.deepEqual(draftOrder({roster:b,winner:'red',draftIndex:0}),['red1','blue1','blue2','red2']);
assert.deepEqual(draftOrder({roster:b,winner:'red',draftIndex:1}),['red2','blue2','blue1','red1']);
assertThrows(()=>draftOrder({roster:b,winner:'draw',draftIndex:0}),/winner must match/);
assertThrows(()=>draftOrder({roster:{blue1:'blue',red1:'red',red2:'red'},winner:'blue'}),/full 1vs1\/2vs2/);
assertThrows(()=>draftOrder({roster:b,winner:'blue',draftIndex:-1}),/draftIndex/);
let d=beginDraft({roster:b,winner:'blue',draftIndex:0,offered:['move','shield','fog','recharge','snipe','team']});
assert.equal(d.phase,'draft');
assertThrows(()=>selectCard(d,{seat:'red1',cardId:'move'}),/current player/);
const orig=d;
d=selectCard(d,{seat:'blue1',cardId:'move'});
assert.equal(orig.turn,0,'selectCard cannot mutate previous snapshot');
assert.deepEqual(orig.owned.blue1,[],'inventory immutable');
assert.deepEqual(d.owned.blue1,['move']);
assertThrows(()=>selectCard(d,{seat:'red1',cardId:'move'}),/not available/);
d=selectCard(d,{seat:'red1',cardId:'shield'});
d=selectCard(d,{seat:'red2',cardId:'fog'});
d=selectCard(d,{seat:'blue2',cardId:'recharge'});
assert.equal(d.phase,'complete');
assert.deepEqual(d.taken,['move','shield','fog','recharge']);
assertThrows(()=>selectCard(d,{seat:'blue1',cardId:'team'}),/outside draft/);
let carry=d.owned;
for(let n=1;n<3;n++){
 let e=beginDraft({roster:b,winner:n%2?'red':'blue',draftIndex:n,offered:['a'+n,'b'+n,'c'+n,'d'+n,'e'+n,'f'+n],owned:carry});
 for(let j=0;j<4;j++)e=selectCard(e,{seat:e.order[e.turn],cardId:e.offered[j]});
 assert.equal(e.phase,'complete');carry=e.owned;
}
for(const cards of Object.values(carry))assert.equal(cards.length,3,'three cards accumulated per player');
let capped=beginDraft({roster:b,winner:'blue',draftIndex:3,offered:['u','v','w','x','y','z'],owned:carry});
const current=capped.order[0],replaceId=capped.owned[current][0];
assertThrows(()=>selectCard(capped,{seat:current,cardId:'u'}),/must replace/);
assertThrows(()=>selectCard(capped,{seat:current,cardId:'u',replaceId:'nonexistent'}),/must replace/);
capped=selectCard(capped,{seat:current,cardId:'u',replaceId});
assert.equal(capped.owned[current].length,3,'replacing never creates an extra slot');
assert(!capped.owned[current].includes(replaceId),'selected card replaces the specified old card');
const hand=beginDraft({roster:a,winner:'guest',draftIndex:0,offered:['tempo','position','control','endurance']});
let choice=selectCard(hand,{seat:'guest',cardId:'tempo'});
choice=selectCard(choice,{seat:'host',cardId:'position'});
assert.equal(choice.phase,'complete');
assert.deepEqual(choice.owned,{host:['position'],guest:['tempo']});
assertThrows(()=>beginDraft({roster:b,winner:'blue',draftIndex:0,offered:['a','a','b','c']}),/duplicate card/);
assertThrows(()=>beginDraft({roster:b,winner:'blue',draftIndex:0,offered:['a','b']}),/one available card per seat/);
const public1=fs.readFileSync(path.join(root,manifest.pages['standard.1vs1'].releaseHtml));
const public2=fs.readFileSync(path.join(root,manifest.pages['standard.2vs2'].releaseHtml));
function gitBlob(b){return crypto.createHash('sha1').update(Buffer.from('blob '+b.length+'\0')).update(b).digest('hex');}
assert.equal(gitBlob(public1),'2737ddf5ec2e32dc3a1be8cb320b90079739d433','published 1vs1 frozen');
assert.equal(gitBlob(public2),'53baf2e70f9a0ff9339fab121697b47a5e2a9d31','published 2vs2 frozen');
console.log('PASS draft foundation: 4 isolated pages/roots, winner-first snake, alternating teammates, accumulative cards, cap exchange, published builds frozen');
