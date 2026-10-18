// Deterministic scripted matchup sensitivity audit for draft prototypes.
// This is NOT a real combat simulator: assumes all listed shots hit, no dodging,
// cover, regen, projectiles, net latency or player/BOT decisions. No win rates.
'use strict';
const assert=require('node:assert/strict');
const {createCombat,applyEvent,modifiers}=require('../draft/card-combat-sim.cjs');
const onlineProfile=require('../draft/online-stat-profile.json');
const {catalog}=require('../draft/offer-policy.cjs');
const specs=onlineProfile.characters['1vs1'],chars=Object.keys(specs);
const AT=[6100,6200,6450,7000,7350,8600,10100,10350,10800,11500,11900,14200];
const decks={
 none:[],
 pressure:['finisher','followthrough','hit_stride'],
 defense:['opening_guard','burst_buffer','clutch_armor'],
 reload:['empty_sprint','last_shell','moving_reload'],
 stealth:['tracking_hit','brush_boost','exposed_sense']
};
const snapshots=[];
let visited=0;
function run({attacker,victim,attackDeck=[],defenseDeck=[],kind='normal',scenario='scripted'}) {
 const participants={host:{team:'host',char:attacker},guest:{team:'guest',char:victim}};
 let state=createCombat({mode:'1vs1.ko',participants,owned:{host:attackDeck,guest:defenseDeck}});
 let dealt=0,extra=0,prevented=0,n=0;
 for(const at of AT){
  if(state.players.guest.hp<=0)break;
  const out=applyEvent(state,{type:'hit',attacker:'host',victim:'guest',kind,
     baseDamage:specs[attacker].baseDamage,at});
  state=out.state;
  n++;dealt+=out.result.damage;extra+=out.result.bonusDamage||0;
  prevented+=out.result.preventedDamage;
  assert(out.result.bonusDamage<=catalog.globalCaps.damageBonusFlatPerHit);
  assert(out.result.damageReductionPct<=catalog.globalCaps.damageReductionPct);
  assert(out.result.preventedDamage>=0);
  assert(state.players.guest.hp>=0&&state.players.guest.hp<=specs[victim].hp);
  visited++;
 }
 return {scenario,attacker,victim,shots:n,
  killed:state.players.guest.hp===0,remainingHp:state.players.guest.hp,
  damage:dealt,extraDamage:extra,preventedDamage:prevented};
}
for(const attacker of chars)for(const victim of chars){
 const baseline=run({attacker,victim,scenario:'none'});
 const offense=run({attacker,victim,attackDeck:decks.pressure,scenario:'pressure'});
 const defense=run({attacker,victim,defenseDeck:decks.defense,scenario:'defense'});
 const duel=run({attacker,victim,attackDeck:decks.pressure,defenseDeck:decks.defense,scenario:'counterplay'});
 assert(offense.shots<=baseline.shots,'offensive cards cannot worsen deterministic solo hit outcome');
 assert(defense.shots>=baseline.shots,'defensive cards cannot lower deterministic solo survival');
 assert(duel.extraDamage>=0&&duel.preventedDamage>=0);
 snapshots.push({attacker,victim,baseline:baseline.shots,offense:offense.shots,
  defense:defense.shots,counterplay:duel.shots,
  baselineKilled:baseline.killed,offenseKilled:offense.killed,defenseKilled:defense.killed,
  counterplayKilled:duel.killed});
}
// Changing card loadouts and order must not break deterministic HP or cap accounting.
const ids=catalog.cards.filter(c=>c.modes.includes('1vs1.ko')).map(c=>c.id);
for(let j=0;j<400;j++){
 const pick=(j,offset)=>Array.from({length:3},(_,i)=>ids[(j*7+offset+i*5)%ids.length]);
 const cardsA=pick(j,0),cardsB=pick(j,2);
 if(new Set(cardsA).size!==3||new Set(cardsB).size!==3)throw Error('bad scenario generator');
 const arg={attacker:chars[j%4],victim:chars[(j+1)%4],attackDeck:cardsA,defenseDeck:cardsB,scenario:'sample'+j};
 const a=run(arg),c=run(arg);
 assert.deepEqual(a,c,'same deterministic combat inputs must replay bit-identically');
}
const summary={
 kind:'scripted_draft_balance_sensitivity_not_win_rates',
 characterStats:chars.map(id=>({char:id,hp:specs[id].hp,damagePerScheduledNormalHit:specs[id].baseDamage,reloadMs:specs[id].reloadMs})),
 notes:[
  'Every scheduled normal attack is assumed to hit a live victim until KO; no miss, cover, skill, regen or real firing cooldown is modeled.',
  'Tank and multi-projectile abilities are treated as a single online-profile baseDamage hit; this is not real pellet DPS.',
  'Hits-to-KO are 1..12 or >12; differences are sensitivity signals, not fair match outcome or win-rate evidence.',
  'No actual online RTDB, host authority, WebKit, iPad touch, replay, BOT or HOT ZONE capture test.'
 ],
 matchupCases:snapshots,deterministicScenarios:400,damageEventsTested:visited
};
assert.equal(snapshots.length,16);
console.log('PASS scripted draft matchup audit: 16 canonical character pairings x 4 loadouts; 400 doubled random-like loadout regressions; '+visited+' bounded damage events');
console.log('AUDIT_RESULT '+JSON.stringify(summary));
