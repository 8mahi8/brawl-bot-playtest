// BRAWL Tactical Draft V0.1: deterministic, host-side combat effect prototype.
// Does not call Firebase, render, mutate live games, or change the original combat rules.
// Events must be constructed from trusted authoritative combat results, never client claims.
'use strict';
const assert=require('node:assert/strict');
const catalog=require('./card-catalog.v0.1.json');
const onlineProfile=require('./online-stat-profile.json');
const {rosterFor}=require('./strategy-core.cjs');
const cards=new Map(catalog.cards.map(card=>[card.id,card]));
const profileFor=mode=>onlineProfile.characters[mode.slice(0,4)];
const caps=catalog.globalCaps;
const plain=x=>JSON.parse(JSON.stringify(x));
const capped=(v,max)=>Math.min(max,Math.max(0,v));
const has=(actor,id)=>actor.cards.includes(id);
function ensureTime(value,min){
 assert(Number.isFinite(value)&&value>=min,'authoritative event timestamp must be monotonic');
}
function player(state,seat){
 assert(Object.prototype.hasOwnProperty.call(state.players,seat),'unknown player seat');
 return state.players[seat];
}
function ready(p,id,at){return (p.cooldowns[id]??-1)<=at;}
function fire(p,id,at){p.cooldowns[id]=at+cards.get(id).effect.cooldownMs;}
function createCombat({mode,participants,owned={},at=0}){
 assert(['1vs1.ko','2vs2.ko','2vs2.area'].includes(mode),'unsupported draft combat mode');
 assert(Number.isFinite(at)&&at>=0,'invalid start time');
 const size=mode.slice(0,4),teams=rosterFor(size),seats=Object.keys(teams),stats=profileFor(mode);
 assert(participants&&typeof participants==='object'&&Object.keys(participants).length===seats.length,'invalid player roster');
 assert(Object.keys(owned).every(seat=>seats.includes(seat)),'unknown owned-card seat');
 const players={};
 for(const seat of seats){
  const input=participants[seat];assert(input&&input.team===teams[seat]&&stats[input.char],'wrong seat/team/character');
  const inventory=owned[seat]||[];
  assert(Array.isArray(inventory)&&inventory.length<=3&&new Set(inventory).size===inventory.length,'card inventory invalid');
  assert(inventory.every(id=>cards.has(id)&&cards.get(id).modes.includes(mode)),'card not eligible for this mode');
  players[seat]={team:input.team,char:input.char,maxHp:stats[input.char].hp,
   hp:stats[input.char].hp,ammo:3,ult:0,reloadProgress:0,cards:[...inventory],
   moveSince:null,lastReloadAt:at,lastDamageAt:at,lastNormalHits:{},chainStartAt:null,
   cooldowns:{},buffs:{},revealedUntil:0};
 }
 return {mode,at,round:1,players};
}
function modifiers(state,seat,{at=state.at,allyDistance=Infinity}={}){
 ensureTime(at,state.at);
 const p=player(state,seat),e=id=>cards.get(id).effect;
 let speed=0,reload=0,defense=0;
 if(has(p,'empty_sprint')&&p.ammo===0)speed+=e('empty_sprint').moveSpeedPct;
 if(has(p,'hit_stride')&&(p.buffs.hit_stride||0)>at)speed+=e('hit_stride').moveSpeedPct;
 if(has(p,'rebound_step')&&(p.buffs.rebound_step||0)>at)speed+=e('rebound_step').moveSpeedPct;
 if(has(p,'brush_boost')&&(p.buffs.brush_boost||0)>at)speed+=e('brush_boost').moveSpeedPct;
 if(has(p,'moving_reload')&&p.moveSince!==null&&at-p.moveSince>=e('moving_reload').requiredMs)reload+=e('moving_reload').reloadSpeedPct;
 if(has(p,'last_shell')&&p.ammo===0)reload+=e('last_shell').reloadSpeedPct;
 if(has(p,'clutch_armor')&&p.hp>0&&p.hp/p.maxHp<=e('clutch_armor').hpThresholdPct/100)defense+=e('clutch_armor').damageReductionPct;
 if(has(p,'gadget_momentum')&&(p.buffs.gadget_momentum||0)>at)defense+=e('gadget_momentum').damageReductionPct;
 if(has(p,'wing_guard')&&p.hp>0&&allyDistance<=e('wing_guard').maxDistance &&
   Object.keys(state.players).some(k=>k!==seat&&state.players[k].team===p.team&&state.players[k].hp>0))
  defense+=e('wing_guard').damageReductionPct;
 return {moveSpeedPct:capped(speed,caps.moveSpeedPct),
  reloadSpeedPct:capped(reload,caps.reloadSpeedPct),
  damageReductionPct:capped(defense,caps.damageReductionPct),
  projectileSpeedPct:has(p,'projectile_tempo')?e('projectile_tempo').travelSpeedPct:0};
}
function applyEvent(state,event){
 assert(state&&event&&typeof event==='object','event and state required');
 ensureTime(event.at,state.at);
 const next=plain(state),at=event.at;
 next.at=at;
 const result={type:event.type,at,triggers:[]};
 const effect=id=>cards.get(id).effect;
 const trigger=id=>result.triggers.push(id);
 if(event.type==='move'){
  const p=player(next,event.seat);
  assert(typeof event.moving==='boolean','moving must be boolean');
  if(event.moving&&p.moveSince===null)p.moveSince=at;
  if(!event.moving)p.moveSince=null;
  result.modifiers=modifiers(next,event.seat);
 }else if(event.type==='reload'){
  const p=player(next,event.seat);
  assert(Number.isFinite(event.dtMs)&&event.dtMs>=0&&event.dtMs<=250,'host-bounded reload dtMs required');
  assert(event.dtMs<=at-p.lastReloadAt,'cannot credit a repeated/overlapping reload interval');
  p.lastReloadAt=at;
  const base=profileFor(next.mode)[p.char].reloadMs;
  if(p.ammo<3&&p.hp>0){
   const mod=modifiers(next,event.seat);
   // Advance exactly once. If the last bullet fills, do not create unlimited ammo.
   p.reloadProgress+=event.dtMs*(1+mod.reloadSpeedPct/100)/base;
   while(p.ammo<3&&p.reloadProgress>=1){p.ammo++;p.reloadProgress-=1;}
   if(p.ammo===3)p.reloadProgress=0;
   result.modifiers=mod;result.triggers=p.ammo>state.players[event.seat].ammo?['ammo_refilled']:[];
  }
  result.ammo=p.ammo;result.reloadProgress=p.reloadProgress;
 }else if(event.type==='shoot'){
  const shooter=player(next,event.seat);
  assert(['normal','gadget','ult'].includes(event.kind),'unknown attack class');
  assert(typeof event.fromBush==='boolean','fromBush must be a trusted host flag');
  const speed=event.kind==='normal'?modifiers(next,event.seat).projectileSpeedPct:0;
  result.projectileSpeedMultiplier=1+speed/100;
  // The host supplies only relevant enemy observers; none receives hidden coordinates.
  const observers=event.observers||[];
  assert(Array.isArray(observers),'observers must be an array');
  for(const {seat,distance} of observers){
   const observer=player(next,seat);
   assert(Number.isFinite(distance)&&distance>=0,'host-calculated distance required');
   if(observer.team===shooter.team||!event.fromBush||!has(observer,'exposed_sense')||!ready(observer,'exposed_sense',at)||distance>effect('exposed_sense').maxDistance||shooter.hp<=0)continue;
   shooter.revealedUntil=Math.max(shooter.revealedUntil,at+1500+effect('exposed_sense').revealExtraMs);
   fire(observer,'exposed_sense',at);trigger('exposed_sense');
  }
 }else if(event.type==='hit'){
  const a=player(next,event.attacker),v=player(next,event.victim);
  assert(event.attacker!==event.victim&&a.team!==v.team,'hit must target an opponent');
  assert(['normal','ult','gadget','dot','gas'].includes(event.kind),'invalid damage class');
  assert(Number.isFinite(event.baseDamage)&&event.baseDamage>0&&event.baseDamage<=1000,'invalid base damage');
  assert(v.hp>0&&a.hp>0,'dead actors cannot apply hits in this isolated model');
  const ordinary=event.kind==='normal';
  let bonus=0;
  const previous=a.lastNormalHits[event.victim];
  if(ordinary&&has(a,'finisher')&&v.hp/v.maxHp<=effect('finisher').enemyHpThresholdPct/100&&ready(a,'finisher',at)){
   bonus+=effect('finisher').bonusFlatDamage;fire(a,'finisher',at);trigger('finisher');
  }
  if(ordinary&&has(a,'followthrough')&&previous!==undefined&&at>previous&&at-previous<=effect('followthrough').windowMs&&ready(a,'followthrough',at)){
   bonus+=effect('followthrough').bonusFlatDamage;fire(a,'followthrough',at);trigger('followthrough');
  }
  bonus=capped(bonus,caps.damageBonusFlatPerHit);
  assert(event.victimAllyDistance===undefined||(Number.isFinite(event.victimAllyDistance)&&event.victimAllyDistance>=0),'trusted ally distance required');
  const baseDefense=modifiers(next,event.victim,{allyDistance:event.victimAllyDistance??Infinity}).damageReductionPct;
  let pct=baseDefense,flat=0;
  if(event.kind!=='dot'&&event.kind!=='gas'){
   if(has(v,'opening_guard')&&at-v.lastDamageAt>=effect('opening_guard').quietMs&&ready(v,'opening_guard',at)){
    flat=effect('opening_guard').flatDamageReduction;fire(v,'opening_guard',at);trigger('opening_guard');
   }
   if(v.chainStartAt===null||at-v.chainStartAt>effect('burst_buffer').windowMs)v.chainStartAt=at;
   else if(at>v.chainStartAt&&has(v,'burst_buffer')){
    if((v.buffs.burst_buffer||0)>=at)pct+=effect('burst_buffer').damageReductionPct;
    else if(ready(v,'burst_buffer',at)){
     pct+=effect('burst_buffer').damageReductionPct;
     v.buffs.burst_buffer=v.chainStartAt+effect('burst_buffer').windowMs;
     fire(v,'burst_buffer',at);trigger('burst_buffer');
    }
   }
  }
  pct=capped(pct,caps.damageReductionPct);
  const beforeHp=v.hp,raw=event.baseDamage+bonus;
  // Fixed barrier applies to post-percentage damage; rounded integer HP damage.
  const mitigated=Math.max(0,Math.round(raw*(1-pct/100)-flat));
  const net=Math.min(v.hp,mitigated);
  v.hp=Math.max(0,v.hp-net);
  v.lastDamageAt=at;
  result.rawDamage=raw;result.bonusDamage=bonus;
  // Damage prevented by cards is NOT the same as hit damage lost to overkill.
  result.preventedDamage=Math.max(0,raw-mitigated);
  result.overkillDamage=Math.max(0,mitigated-net);
  result.damage=net;result.victimHp=v.hp;result.damageReductionPct=pct;
  if(ordinary&&net>0){
   a.lastNormalHits[event.victim]=at;
   if(has(a,'hit_stride')&&ready(a,'hit_stride',at)){
    a.buffs.hit_stride=at+effect('hit_stride').durationMs;fire(a,'hit_stride',at);trigger('hit_stride');
   }
   if(has(a,'tracking_hit')&&ready(a,'tracking_hit',at)){
    v.revealedUntil=Math.max(v.revealedUntil,at+1500+effect('tracking_hit').revealExtraMs);
    fire(a,'tracking_hit',at);trigger('tracking_hit');
   }
   if(has(a,'duo_mark')&&a.team!==undefined&&ready(a,'duo_mark',at)){
    const ally=Object.entries(next.players).some(([seat,p])=>seat!==event.attacker&&p.team===a.team&&p.hp>0&&
      p.lastNormalHits[event.victim]!==undefined&&at>p.lastNormalHits[event.victim]&&at-p.lastNormalHits[event.victim]<=effect('duo_mark').windowMs);
    if(ally){
     a.ult=Math.min(100,a.ult+effect('duo_mark').bonusUltPoints);
     fire(a,'duo_mark',at);trigger('duo_mark');
    }
   }
  }
  if(v.hp>0&&net>0){
   if(has(v,'rebound_step')&&ready(v,'rebound_step',at)){
    v.buffs.rebound_step=at+effect('rebound_step').durationMs;fire(v,'rebound_step',at);trigger('rebound_step');
   }
   const th=effect('emergency_feed').hpThresholdPct/100;
   if(has(v,'emergency_feed')&&ready(v,'emergency_feed',at)&&beforeHp/v.maxHp>th&&v.hp/v.maxHp<=th&&v.ammo<3){
    v.reloadProgress=Math.min(1,v.reloadProgress+effect('emergency_feed').reloadProgressPct/100);
    if(v.reloadProgress>=1){v.ammo++;v.reloadProgress=0;}
    fire(v,'emergency_feed',at);trigger('emergency_feed');
   }
  }
 }else if(event.type==='gadget'){
  const p=player(next,event.seat);
  assert(p.hp>0,'dead actors cannot use GAD');
  if(has(p,'gadget_momentum')&&ready(p,'gadget_momentum',at)){
   p.buffs.gadget_momentum=at+effect('gadget_momentum').durationMs;fire(p,'gadget_momentum',at);trigger('gadget_momentum');
  }
 }else if(event.type==='bush_exit'){
  const p=player(next,event.seat);
  assert(p.hp>0,'dead actors cannot leave bush');
  if(has(p,'brush_boost')&&ready(p,'brush_boost',at)){
   p.buffs.brush_boost=at+effect('brush_boost').durationMs;fire(p,'brush_boost',at);trigger('brush_boost');
  }
 }else if(event.type==='ammo'){
  const p=player(next,event.seat);
  assert(Number.isSafeInteger(event.ammo)&&event.ammo>=0&&event.ammo<=3,'invalid authoritative ammo update');
  p.ammo=event.ammo;p.reloadProgress=0;
 }else if(event.type==='respawn'){
  assert(next.mode==='2vs2.area','KO cannot respawn');
  const p=player(next,event.seat);
  assert(p.hp===0,'only defeated actors respawn');
  p.hp=p.maxHp;p.ammo=3;p.reloadProgress=0;p.moveSince=null;p.lastReloadAt=at;
  p.lastDamageAt=at;p.chainStartAt=null;p.lastNormalHits={};p.buffs={};p.revealedUntil=0;
  // Intentionally retain cooldowns and inventories to avoid zone death exploits.
 }else if(event.type==='round_start'){
  assert(event.round===next.round+1&&Number.isSafeInteger(event.round),'next sequential round required');
  next.round=event.round;
  for(const p of Object.values(next.players)){
   p.hp=p.maxHp;p.ammo=3;p.reloadProgress=0;p.moveSince=null;p.lastReloadAt=at;
   p.lastDamageAt=at;p.chainStartAt=null;p.lastNormalHits={};p.buffs={};p.revealedUntil=0;
   // Match ULT resources, cooldowns and owned cards persist across KO rounds, as in the current online squad.
  }
 }else throw Error('unknown effect event '+event.type);
 return {state:next,result};
}
module.exports={createCombat,modifiers,applyEvent};
