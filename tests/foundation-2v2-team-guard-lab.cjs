// Tests the ACTUAL compiled tank team-guard combat reducer and generated gameplay delta.
'use strict';
const fs=require('node:fs'),assert=require('node:assert/strict'),vm=require('node:vm');
const {buildTeamGuard,MODIFICATIONS}=require('../scripts/build-team-guard-lab.cjs');
const prior=fs.readFileSync('foundation/2v2-open-arena-tank-lab.html','utf8');
const now=fs.readFileSync('foundation/2v2-open-arena-team-guard-lab.html','utf8');
assert.equal(now,buildTeamGuard(prior),'full output reproducible');
let restored=now;
for(const entry of [...MODIFICATIONS].reverse()) {
 assert.equal(restored.split(entry.to).length-1,1,'reverse change one occurrence '+entry.key);
 restored=restored.replace(entry.to,entry.from);
}
assert.equal(restored,prior,'EXACTLY the intended GAD modifications only; map and weapons unchanged');
const source=now.match(/<script>([sS]*?)</script>/)?.[1];
assert(source?.length>100000,'app has actual inline game');
new vm.Script(source,{filename:'team-guard-lab'});
const env={structuredClone};
for(const key of ['SHARED STEALTH V1','COMBAT CORE','BOT CORE']){
 const start=source.indexOf('/* BEGIN '+key),end=source.indexOf('/* END '+key,start);
 assert(start>=0&&end>start,'module '+key+' available');
 let full=source.slice(start,end);
 if(key==='COMBAT CORE'){
  for(const e of ['SHARED WEAPON RULES','SHARED PROJECTILE PHYSICS','SHARED MATCH STATE','SHARED ABILITIES']){
   const a=source.indexOf('/* BEGIN '+e),b=source.indexOf('/* END '+e,a);
   assert(a>=0&&b>a,'dependent module '+e);
   full+='\n'+source.slice(a,b);
  }
 }
 vm.runInNewContext(full,env,{filename:key});
}
const {BrawlCombatV8:combat}=env;
assert(combat,'combat reducer available');
const charFrom=source.indexOf('const CHARS='),charTo=source.indexOf('let WALLS=',charFrom);
const spawnsLine=source.match(/^const SPAWNS=.*$/m)?.[0];
const {CHARS,SPAWNS}=new Function('BALANCE',source.slice(charFrom,charTo)+'\n'+spawnsLine+'\nreturn {CHARS,SPAWNS}')(combat.balance);
const seats={blue1:{id:'t',char:'tank'},blue2:{id:'a',char:'gunner'},red1:{id:'e',char:'gunner'},red2:{id:'f',char:'sniper'}};
const keys=Object.keys(seats);
const core=combat.create({chars:CHARS,walls:[],spawns:SPAWNS,seatKeys:keys});
assert.equal(CHARS.tank.hp,160);assert.equal(CHARS.gunner.hp,100);
function start(allyX=480,allyY=645){
 const g=core.initialize('team-guard-qa',seats,'ko',0);g.hostToken='qa';g.clock={t:100,wallAt:100};
 const input={t:{x:480,y:420,motionRev:0,life:0},a:{x:allyX,y:allyY,motionRev:0,life:0},
  e:{x:1440,y:420,motionRev:0,life:0},f:{x:1440,y:700,motionRev:0,life:0}};
 return {g,input};
}
function gadget(g,input){
 const a={eventId:'tank-gad-1',owner:'t',matchId:g.matchId,round:g.round,seq:1,life:0,type:'gadget',angle:0,reach:115,x:480,y:420,at:200};
 return core.accept(g,a,input,200);
}
const within=start(),guard=gadget(within.g,within.input);
assert.equal(guard.usedActions['tank-gad-1'].status,'accepted','gadget used');
assert.equal(guard.stats.t.guardTargetId,'a','nearest teammate linked only if near');
assert.equal(guard.stats.t.guardUntil,3300,'preserves 3.2 second teammate guard');
assert.equal(guard.stats.t.gadgets,1,'one charge consumed');
assert.equal(guard.motions.t.x,595,'115 dash retained');
let input=within.input;
input.t={x:595,y:420,motionRev:guard.motions.t.rev,life:0};
guard.projectiles.p1={id:'p1',owner:'e',ownerLife:0,team:'red',char:'gunner',damage:40,x:595,y:420,vx:0,vy:0,dist:0,range:500,radius:6,spawnAt:0};
guard.projectiles.p2={id:'p2',owner:'e',ownerLife:0,team:'red',char:'gunner',damage:40,x:480,y:645,vx:0,vy:0,dist:0,range:500,radius:6,spawnAt:0};
const result=core.step(guard,input,200,guard.combatRev,'qa');
assert.equal(result.hp.t,120,'tank takes full 40 damage even with own GAD active');
assert.equal(result.hp.a,70,'guarded teammate takes 30 after 25 percent shield');
assert.equal(result.stats.t.guardSaved,10,'guard saves 10 HP for ally only');
const hitEvents=Object.values(result.events).filter(x=>x.type==='hit');
assert.equal(hitEvents.length,2,'both bullets hit');
assert.equal(hitEvents.find(x=>x.victim==='t').guarded,false,'tank not visually marked shielded');
assert.equal(hitEvents.find(x=>x.victim==='a').guarded,true,'ally marked shielded');
const far=start(1400,700),dashOnly=gadget(far.g,far.input);
assert.equal(dashOnly.stats.t.guardTargetId,'','no map-global guard against distant teammate');
assert.equal(dashOnly.stats.t.guardUntil,0,'no phantom shield');
assert.equal(dashOnly.motions.t.x,595,'dash remains useful even without a teammate');
const uiLookup=source.match(/function guardFor(id,now)[sS]*?return null;}/)?.[0];
assert(uiLookup&&uiLookup.includes('source!==id&&st.guardTargetId===id'),'UI shield glows on teammate, not self');
assert(!now.includes('自分と味方への被ダメージを35%軽減'),'outdated skill description removed');
assert(now.includes('自分には軽減なし'),'correct Japanese ability guide');
console.log('PASS team-guard gameplay: SELF unprotected, nearby ally 25% shield, no cross-map link, dash retained, UI consistent');
