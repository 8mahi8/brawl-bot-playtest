// Candidate-card and offer fairness contracts. No Firebase, browser, combat or production mutation.
'use strict';
const assert=require('node:assert/strict');
const {rosterFor,beginDraft,selectCard}=require('../draft/strategy-core.cjs');
const {catalog,eligibleCards,assessOffer,proposeOffer}=require('../draft/offer-policy.cjs');
assert.equal(catalog.status,'candidate_only_no_runtime_effects');
assert.equal(catalog.cards.length,18,'V0.1 has 16 universal and two duo-only cards');
const ids=new Set(catalog.cards.map(c=>c.id));
assert.equal(ids.size,18,'unique stable IDs');
const categoryCounts={};
for(const card of catalog.cards){
 assert(/^[a-z][a-z0-9_]+$/.test(card.id),'safe card ID');
 assert(card.name&&card.description.length>=20&&card.weakness.length>=20,'player-readable effect/counterplay');
 assert(['mobility','reload','defense','intel','pressure','tempo','teamwork'].includes(card.family));
 categoryCounts[card.family]=(categoryCounts[card.family]||0)+1;
 assert.equal(card.rarity,'common','winner-first must not be warped by rarity jackpots');
 assert(card.hook&&typeof card.effect==='object','future-engine effect hook specified');
 assert(card.modes.length>=1&&new Set(card.modes).size===card.modes.length);
 assert(card.synergies.length>=1&&card.answers.length>=1,'cards need meaningful relationships');
 for(const other of [...card.synergies,...card.answers])
  assert(ids.has(other)&&other!==card.id,'synergy/answer must refer to another card in pool');
 for(const [k,v] of Object.entries(card.effect)){
  if(typeof v==='number')assert(Number.isFinite(v)&&v>=0,'nonnegative numeric tuning parameters');
  if(k==='moveSpeedPct')assert(v<=catalog.globalCaps.moveSpeedPct);
  if(k==='reloadSpeedPct')assert(v<=catalog.globalCaps.reloadSpeedPct);
  if(k==='damageReductionPct')assert(v<=catalog.globalCaps.damageReductionPct);
  if(k==='bonusFlatDamage')assert(v<=catalog.globalCaps.damageBonusFlatPerHit);
  if(k==='revealExtraMs')assert(v<=catalog.globalCaps.revealExtraMs);
  if(k==='bonusUltPoints')assert(v<=catalog.globalCaps.ultBonusPointsPerEvent);
 }
 if(card.family==='teamwork')assert.deepEqual(card.modes,['2vs2.ko','2vs2.area']);
 else assert.deepEqual(card.modes,['1vs1.ko','2vs2.ko','2vs2.area'],'universal cards must work in KO and area');
}
assert.equal(Object.keys(categoryCounts).length,7,'distinct archetypes represented');
assert.equal(eligibleCards('1vs1.ko').length,16);
for(const mode of ['1vs1.ko','2vs2.ko','2vs2.area']){
 const pool=eligibleCards(mode);
 assert.equal(pool.length,mode==='1vs1.ko'?16:18);
 for(const c of pool){
  assert(pool.some(x=>x.answers.includes(c.id)),mode+' missing available opposing counter to '+c.id);
  assert(pool.some(x=>x.synergies.includes(c.id)),mode+' missing in-pool synergy for '+c.id);
 }
}
assert.throws(()=>eligibleCards('1vs1.area'),/unknown supported draft mode/);
const modes=[
 {mode:'1vs1.ko',teams:['host','guest'],seats:2},
 {mode:'2vs2.ko',teams:['blue','red'],seats:4},
 {mode:'2vs2.area',teams:['blue','red'],seats:4}
];
let drafts=0,picks=0,exhaustivePaths=0;
for(const {mode,teams,seats} of modes)for(const winner of teams){
 const roster=rosterFor(mode.slice(0,4)),all=eligibleCards(mode).map(c=>c.id);
 // Endgame inventories hold 3 cards. Explicitly test both clustered and
 // offset inventories; drafting four shared picks must never deadlock.
 for(const rotated of [false,true]){
  const owned={};
  for(const [i,seat] of Object.keys(roster).entries())
   owned[seat]=[0,1,2].map(j=>all[(j+(rotated?i*3:0))%all.length]);
  for(let round=0;round<4;round++)for(let seed=0;seed<28;seed++){
   const input={mode,roster,winner,draftIndex:round,owned,
     seed:seed+round*701+(rotated?10000:0)};
   const offered=proposeOffer(input);
   assert.deepEqual(proposeOffer(input),offered,'same host seed reproduces same draft offer');
   const analysis=assessOffer({...input,offered});
   assert(analysis.safe,'the offer must survive any earlier-card picks');
   assert(analysis.categories>=3);
   assert.equal(offered.length,mode==='1vs1.ko'?4:6);
   function visit(state){
    if(state.phase==='complete'){exhaustivePaths++;return;}
    const seat=state.order[state.turn],inventory=state.owned[seat];
    const choices=state.offered.filter(x=>!state.taken.includes(x)&&!inventory.includes(x));
    assert(choices.length>=1,'no seat can be starved by adversarial earlier choices');
    for(const id of choices){
     const replaceId=inventory.length===state.maxOwnedCards?inventory[0]:null;
     visit(selectCard(state,{seat,cardId:id,replaceId}));
     picks++;
    }
   }
   const state=beginDraft({roster,winner,draftIndex:round,offered,owned});
   visit(state);drafts++;
  }
 }
}
const roster=rosterFor('2vs2'),pool=eligibleCards('2vs2.ko').map(c=>c.id);
const bad={roster,winner:'blue',draftIndex:0,mode:'2vs2.ko',
 owned:{blue2:pool.slice(0,3)},offered:pool.slice(0,6)};
const result=assessOffer(bad);
assert.equal(result.safe,false,'the fourth player cannot be offered only 3 new choices after 3 earlier picks');
assert(result.issues.some(x=>x.includes('blue2')));
assert.throws(()=>proposeOffer({mode:'2vs2.ko',roster,winner:'blue',seed:-1}),/server-picked seed/);
assert.throws(()=>assessOffer({mode:'2vs2.ko',roster,winner:'red',offered:[...pool.slice(0,5),pool[0]]}),/duplicate offers/);
// Early game two-player offer still exposes multiple families.
const first=proposeOffer({mode:'1vs1.ko',roster:rosterFor('1vs1'),winner:'guest',draftIndex:0,seed:1234});
assert(assessOffer({mode:'1vs1.ko',roster:rosterFor('1vs1'),winner:'guest',offered:first}).safe);
console.log('PASS Tactical Draft cards: 18 counterable concepts (16 universal, 2 team), 7 families, bounded effects');
console.log('PASS fair offers: '+drafts+' deterministic capped-inventory drafts, '+picks+' recursive transitions / '+exhaustivePaths+' complete paths, no winner-first/loser deadlocks');
