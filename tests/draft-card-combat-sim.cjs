// Exact effect rules regression: canonical 4-character HP and provisional draft effects.
// Pure Node test, zero cloud/browser access. Scenarios are not win-rate measurements.
'use strict';
const assert=require('node:assert/strict');
const {createCombat,modifiers,applyEvent}=require('../draft/card-combat-sim.cjs');
const contract=require('../shared/brawl-core-contract.json');
const roster1={host:{team:'host',char:'gunner'},guest:{team:'guest',char:'sniper'}};
const roster2={
 blue1:{team:'blue',char:'gunner'},blue2:{team:'blue',char:'tank'},
 red1:{team:'red',char:'sniper'},red2:{team:'red',char:'bomber'}
};
let scenarios=0,events=0;
function begin(owned={},mode='1vs1.ko',participants=roster1){scenarios++;return createCombat({mode,participants,owned});}
function step(state,event){events++;return applyEvent(state,event);}
function owned(host,guest){return {host,guest};}
const t=(s,e)=>step(s,e).state;
function trigger(out,name){assert(out.result.triggers.includes(name),name+' effect did not activate');}
let s=begin(owned(['empty_sprint','moving_reload','last_shell'],[]));
const original=JSON.stringify(s);
s=t(s,{type:'ammo',seat:'host',ammo:0,at:0});
s=t(s,{type:'move',seat:'host',moving:true,at:100});
assert.deepEqual(modifiers(s,'host',{at:1000}),{
 moveSpeedPct:9,reloadSpeedPct:20,damageReductionPct:0,projectileSpeedPct:0
});
let out=step(s,{type:'reload',seat:'host',dtMs:200,at:1000});s=out.state;
assert.equal(out.result.modifiers.reloadSpeedPct,20);
assert.throws(()=>step(out.state,{type:'reload',seat:'host',dtMs:200,at:1000}),/overlapping reload interval/);
assert.equal(s.players.host.reloadProgress,200*1.2/contract.common.characters.gunner.reloadMs);
s=t(s,{type:'move',seat:'host',moving:false,at:1010});
assert.equal(modifiers(s,'host').reloadSpeedPct,16);
assert.equal(JSON.parse(original).players.host.ammo,3,'pure engine must not mutate prior state');
assert.throws(()=>step(s,{type:'reload',seat:'host',dtMs:3000,at:1020}),/host-bounded/);
assert.throws(()=>step(s,{type:'ammo',seat:'host',ammo:5,at:1020}),/authoritative ammo/);
assert.throws(()=>step(s,{type:'ammo',seat:'host',ammo:0,at:900}),/monotonic/);
for(const [char,hp] of Object.entries(contract.common.characters)){
 const x=createCombat({mode:'1vs1.ko',participants:{host:{team:'host',char},guest:{team:'guest',char:'gunner'}}});
 assert.equal(x.players.host.hp,hp.hp,'must reflect canonical HP for '+char);
}
s=begin(owned(['hit_stride','brush_boost','empty_sprint'],[]));
out=step(s,{type:'hit',attacker:'host',victim:'guest',kind:'normal',baseDamage:5,at:100});
trigger(out,'hit_stride');s=out.state;
s=t(s,{type:'bush_exit',seat:'host',at:101});
s=t(s,{type:'ammo',seat:'host',ammo:0,at:102});
assert.equal(modifiers(s,'host').moveSpeedPct,12,'multi-card speed capped at 12%');
assert.equal(modifiers(s,'host',{at:2000}).moveSpeedPct,9,'timed movement modifiers expire');
s=begin(owned(['finisher','followthrough'],[]));
s=t(s,{type:'hit',attacker:'host',victim:'guest',kind:'normal',baseDamage:50,at:1000});
out=step(s,{type:'hit',attacker:'host',victim:'guest',kind:'normal',baseDamage:10,at:1300});
trigger(out,'finisher');trigger(out,'followthrough');
assert.equal(out.result.bonusDamage,7,'5+3 bonus capped at +7, not +8');
assert.equal(out.result.damage,17);assert.equal(out.state.players.guest.hp,3);
assert.equal(out.result.overkillDamage,0);
assert.equal(out.result.preventedDamage,0);
s=begin(owned([],['opening_guard']));
out=step(s,{type:'hit',attacker:'host',victim:'guest',kind:'normal',baseDamage:20,at:6000});
trigger(out,'opening_guard');assert.equal(out.result.damage,13);
out=step(out.state,{type:'hit',attacker:'host',victim:'guest',kind:'normal',baseDamage:10,at:6100});
assert(!out.result.triggers.includes('opening_guard'));assert.equal(out.result.damage,10);
s=begin(owned([],['burst_buffer']));
s=t(s,{type:'hit',attacker:'host',victim:'guest',kind:'normal',baseDamage:10,at:1000});
out=step(s,{type:'hit',attacker:'host',victim:'guest',kind:'normal',baseDamage:20,at:1200});
trigger(out,'burst_buffer');assert.equal(out.result.damageReductionPct,11);
assert.equal(out.result.damage,18);s=out.state;
out=step(s,{type:'hit',attacker:'host',victim:'guest',kind:'normal',baseDamage:20,at:1300});
assert.equal(out.result.damage,18,'followup hits in same 0.7s burst are buffered');
out=step(out.state,{type:'hit',attacker:'host',victim:'guest',kind:'normal',baseDamage:5,at:1900});
assert.equal(out.result.damage,5,'new burst during cooldown is unprotected');
s=begin(owned([],['clutch_armor']));
s=t(s,{type:'hit',attacker:'host',victim:'guest',kind:'normal',baseDamage:50,at:1000});
out=step(s,{type:'hit',attacker:'host',victim:'guest',kind:'normal',baseDamage:10,at:1100});
assert.equal(out.result.damageReductionPct,8);
s=begin({blue1:['wing_guard','clutch_armor','gadget_momentum']},'2vs2.area',roster2);
s=t(s,{type:'hit',attacker:'red1',victim:'blue1',kind:'normal',baseDamage:70,at:100});
s=t(s,{type:'gadget',seat:'blue1',at:101});
out=step(s,{type:'hit',attacker:'red1',victim:'blue1',kind:'normal',baseDamage:10,victimAllyDistance:100,at:102});
assert.equal(out.result.damageReductionPct,12,'8+6+5 mitigation hard-capped at 12%');
out=step(s,{type:'hit',attacker:'red1',victim:'blue1',kind:'normal',baseDamage:10,victimAllyDistance:400,at:102});
assert.equal(out.result.damageReductionPct,12,'8+6 away from ally is still capped');
out=step(s,{type:'hit',attacker:'red1',victim:'blue1',kind:'normal',baseDamage:10,victimAllyDistance:400,at:3000});
assert.equal(out.result.damageReductionPct,8,'gadget buff expires, ally far away');
s=begin(owned(['projectile_tempo'],[]));
out=step(s,{type:'shoot',seat:'host',kind:'normal',fromBush:false,at:10});
assert.equal(out.result.projectileSpeedMultiplier,1.08);
out=step(out.state,{type:'shoot',seat:'host',kind:'ult',fromBush:false,at:11});
assert.equal(out.result.projectileSpeedMultiplier,1,'ULT intentionally unchanged');
s=begin(owned(['tracking_hit'],['exposed_sense']));
out=step(s,{type:'hit',attacker:'host',victim:'guest',kind:'normal',baseDamage:10,at:500});
trigger(out,'tracking_hit');
assert.equal(out.state.players.guest.revealedUntil,500+2300);
out=step(out.state,{type:'shoot',seat:'host',kind:'normal',fromBush:true,at:800,observers:[{seat:'guest',distance:300}]});
trigger(out,'exposed_sense');
assert.equal(out.state.players.host.revealedUntil,800+2300);
out=step(out.state,{type:'shoot',seat:'host',kind:'normal',fromBush:true,at:900,observers:[{seat:'guest',distance:300}]});
assert(!out.result.triggers.includes('exposed_sense'),'observer cooldown throttles repeated reveals');
s=begin(owned(['emergency_feed'],[]));
s=t(s,{type:'ammo',seat:'host',ammo:0,at:10});
out=step(s,{type:'hit',attacker:'guest',victim:'host',kind:'normal',baseDamage:70,at:11});
trigger(out,'emergency_feed');assert.equal(out.state.players.host.reloadProgress,0.25);
out=step(out.state,{type:'hit',attacker:'guest',victim:'host',kind:'normal',baseDamage:5,at:12});
assert(!out.result.triggers.includes('emergency_feed'),'only one downward threshold crossing');
s=begin(owned([],['rebound_step']));
out=step(s,{type:'hit',attacker:'host',victim:'guest',kind:'normal',baseDamage:90,at:100});
assert(!out.result.triggers.includes('rebound_step'),'no buff for KO victims');
s=begin({blue1:['duo_mark']},'2vs2.area',roster2);
s=t(s,{type:'hit',attacker:'blue2',victim:'red1',kind:'normal',baseDamage:4,at:500});
out=step(s,{type:'hit',attacker:'blue1',victim:'red1',kind:'normal',baseDamage:4,at:700});
trigger(out,'duo_mark');assert.equal(out.state.players.blue1.ult,4);
out=step(out.state,{type:'hit',attacker:'blue1',victim:'red1',kind:'normal',baseDamage:4,at:800});
assert(!out.result.triggers.includes('duo_mark'),'teamwork card cooldown enforced');
s=begin({blue1:['brush_boost','gadget_momentum','rebound_step']},'2vs2.area',roster2);
out=step(s,{type:'bush_exit',seat:'blue1',at:100});
trigger(out,'brush_boost');s=out.state;
out=step(s,{type:'gadget',seat:'blue1',at:110});
trigger(out,'gadget_momentum');s=out.state;
out=step(s,{type:'hit',attacker:'red1',victim:'blue1',kind:'normal',baseDamage:5,at:120});
trigger(out,'rebound_step');s=out.state;
assert.equal(modifiers(s,'blue1').moveSpeedPct,12,'bush + rebound is capped');
s=t(s,{type:'hit',attacker:'red1',victim:'blue1',kind:'normal',baseDamage:105,at:121});
assert.equal(s.players.blue1.hp,0);
const cooldown=JSON.stringify(s.players.blue1.cooldowns);
s=t(s,{type:'respawn',seat:'blue1',at:4000});
assert.equal(s.players.blue1.hp,100);
assert.equal(JSON.stringify(s.players.blue1.cooldowns),cooldown,'respawn preserves cooldowns');
assert.equal(Object.keys(s.players.blue1.buffs).length,0,'respawn clears transient buffs');
assert.equal(s.players.blue1.cards.length,3,'respawn preserves cards');
s=t(s,{type:'round_start',round:2,at:4500});
assert.equal(JSON.stringify(s.players.blue1.cooldowns),cooldown,'round transition preserves cooldowns');
assert.equal(s.players.blue1.cards.length,3);
assert.throws(()=>t(s,{type:'round_start',round:4,at:4600}),/next sequential round/);
assert.throws(()=>begin({host:['duo_mark']},'1vs1.ko',roster1),/card not eligible/);
assert.throws(()=>t(begin(),{type:'respawn',seat:'host',at:1}),/KO cannot respawn/);
console.log('PASS 18-card engine event tests: '+scenarios+' setups / '+events+' pure transitions; HP, caps, cooldowns, reveal, ally, KO, respawn, round continuity');
