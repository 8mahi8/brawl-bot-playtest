// Standalone Foundation V1 2vs2 regression: run from repo root with Node >=22.
// Pure reducer/BOT tests + script parsing. Not a browser, iPad or Firebase verification.
'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync('foundation/2v2-foundation-v1.html','utf8');
const script=html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
assert(script&&script.length>100000,'Foundation V1 2vs2 complete inline script');
new vm.Script(script,{filename:'foundation/2v2-foundation-v1.html'});
const env={structuredClone};
for(const name of ['SHARED STEALTH V1','COMBAT CORE','BOT CORE']){
 const a=script.indexOf('/* BEGIN '+name),b=script.indexOf('/* END '+name,a);
 assert(a>=0&&b>a,'module '+name);
 const weaponA=script.indexOf('/* BEGIN SHARED WEAPON RULES */'),weaponB=script.indexOf('/* END SHARED WEAPON RULES */',weaponA);
 assert(weaponA>=0&&weaponB>weaponA,'generated shared weapon rules present');
 const physicsA=script.indexOf('/* BEGIN SHARED PROJECTILE PHYSICS */'),physicsB=script.indexOf('/* END SHARED PROJECTILE PHYSICS */',physicsA);
 assert(physicsA>=0&&physicsB>physicsA,'shared projectile physics present');
 const matchA=script.indexOf('/* BEGIN SHARED MATCH STATE */'),matchB=script.indexOf('/* END SHARED MATCH STATE */',matchA);
 assert(matchA>=0&&matchB>matchA,'shared match runtime present');
 const abilityA=script.indexOf('/* BEGIN SHARED ABILITIES */'),abilityB=script.indexOf('/* END SHARED ABILITIES */',abilityA);
 assert(abilityA>=0&&abilityB>abilityA,'shared abilities runtime present');
 const moduleCode=script.slice(a,b)+(name==='COMBAT CORE'?'\n'+script.slice(weaponA,weaponB)+'\n'+script.slice(physicsA,physicsB)+'\n'+script.slice(matchA,matchB)+'\n'+script.slice(abilityA,abilityB):'');
 vm.runInNewContext(moduleCode,env,{filename:name});
}
const {BrawlCombatV8:combat,BrawlBotV9:bot}=env;
assert(combat&&bot,'required modules');
const a=script.indexOf('const CHARS='),b=script.indexOf('let WALLS=',a);
const spawnLine=script.match(/^const SPAWNS=.*$/m)?.[0];
assert(a>=0&&b>a&&spawnLine,'characters and map declarations');
const {CHARS,SPAWNS,KO_WALLS,AREA_WALLS,KO_BUSHES}=new Function('BALANCE',script.slice(a,b)+'\n'+spawnLine+'\nreturn {CHARS,SPAWNS,KO_WALLS,AREA_WALLS,KO_BUSHES}')(combat.balance);
const keys=['blue1','blue2','red1','red2'];
const seats={blue1:{id:'p',char:'gunner'},blue2:{id:'b',char:'tank'},red1:{id:'e',char:'sniper'},red2:{id:'f',char:'bomber'}};
const core=combat.create({chars:CHARS,walls:[],spawns:SPAWNS,seatKeys:keys});
const init=(mode='ko')=>{const g=core.initialize('qa',seats,mode,0);g.hostToken='qa';return g;};
const pos=()=>({p:{x:460,y:400,motionRev:0,life:0,matchId:'qa',round:1},
 b:{x:400,y:400,motionRev:0,life:0,matchId:'qa',round:1},
 e:{x:1000,y:640,motionRev:0,life:0,matchId:'qa',round:1},
 f:{x:1300,y:640,motionRev:0,life:0,matchId:'qa',round:1}});
let count=0;
function check(label,fn){fn();count++;console.log('PASS',label);}
function impact({mode='ko',guardUntil=2400,tankAlive=true,enemyGuard=false,farTank=false,hitAt=200}={}){
 let g=init(mode),positions=pos();g.clock.t=hitAt-100;g.clock.wallAt=hitAt-100;
 g.stats.b.guardUntil=guardUntil;g.stats.b.guardTargetId='p';g.stats.b.guardTargetLife=0;if(!tankAlive)g.hp.b=0;
 if(enemyGuard){g.stats.b.guardUntil=0;g.stats.e.char='tank';g.stats.e.guardUntil=guardUntil;positions.e.x=440;positions.e.y=400;}
 if(farTank){positions.b.x=100;positions.b.y=100;}
 g.projectiles.h={id:'h',owner:'e',ownerLife:0,team:'red',x:460,y:400,vx:0,vy:0,dist:0,range:800,radius:6,damage:20,char:'gunner',spawnAt:0};
 return core.step(g,positions,hitAt,g.combatRev,'qa');
}
check('Foundation V1 2vs2 script parses and original movement stays intact',()=>{
 assert.equal(CHARS.gunner.speed,102);assert.equal(CHARS.tank.speed,102);assert.equal(CHARS.sniper.speed,102);
});
check('Tank gadget consumes one charge, dashes, activates 3.2s Guardian Link',()=>{
 let g=init();g=core.accept(g,{eventId:'skill',owner:'b',matchId:'qa',round:1,seq:1,life:0,type:'gadget',angle:0,reach:310,x:SPAWNS.blue2.x,y:SPAWNS.blue2.y,at:200},{},200);
 assert.equal(g.usedActions.skill.status,'accepted');assert.equal(g.stats.b.gadgets,1);
 assert.equal(g.stats.b.guardUntil,3200);assert.equal(g.stats.b.guardTargetId,'p');assert.equal(g.stats.b.guardTargetLife,0);assert.equal(g.motions.b.rev,1);
});
check('Linked ally receives 35% less bullet damage',()=>{
 const g=impact();assert.equal(g.hp.p,CHARS.gunner.hp-13);
 assert(Object.values(g.events).some(e=>e.type==='hit'&&e.guarded&&e.amount===13&&e.saved===7&&e.guardian==='b'));
});
check('Guard protects tank owner too',()=>{
 let g=init();g.stats.b.guardUntil=2400;g.projectiles.h={id:'h',owner:'e',team:'red',x:400,y:400,vx:0,vy:0,dist:0,range:600,radius:6,damage:20,char:'gunner',spawnAt:0};
 g=core.step(g,pos(),100,g.combatRev,'qa');assert.equal(g.hp.b,CHARS.tank.hp-13);
});
check('Expired guard does not reduce damage',()=>assert.equal(impact({guardUntil:200}).hp.p,CHARS.gunner.hp-20));
check('Dead guardian cannot protect',()=>assert.equal(impact({tankAlive:false}).hp.p,CHARS.gunner.hp-20));
check('Linked guard persists when teammate moves away',()=>assert.equal(impact({farTank:true}).hp.p,CHARS.gunner.hp-13));
check('Enemy guardian cannot protect opposing team',()=>assert.equal(impact({enemyGuard:true}).hp.p,CHARS.gunner.hp-20));
check('Guard works under AREA combat rules too',()=>assert.equal(impact({mode:'area'}).hp.p,CHARS.gunner.hp-13));
check('AREA respawn clears old guard',()=>{
 let g=init('area');g.clock.t=3900;g.clock.wallAt=3900;g.stats.b.guardUntil=5000;g.hp.b=0;g.respawns.b=4000;
 g=core.step(g,{},4000,g.combatRev,'qa');assert.equal(g.stats.b.guardUntil,0);assert(g.hp.b>0);
});
check('Tank BOT chooses rescue gadget when ally wounded and threatened',()=>{
 const ai=bot.create({chars:CHARS,walls:[],bushes:[],spawns:SPAWNS,seatKeys:keys}),g=init();
 g.clock.t=5000;g.hp.p=45;g.combatAt.p=4700;g.hp.f=0;
 const input=pos();input.p.x=560;input.p.y=400;input.e.x=730;input.e.y=400;
 const d=ai.decide({game:g,positions:input,owner:'b',actor:{x:500,y:400,a:0},
  brain:{scope:'qa:1:0:0',nextShot:100000,nextSkill:0,path:[],nextPath:0},wallNow:5000});
 assert.equal(d.action,'gadget');assert(Number.isFinite(d.angle));
});
check('Tank BOT cannot spend gadget repeatedly inside active guard',()=>{
 const ai=bot.create({chars:CHARS,walls:[],bushes:[],spawns:SPAWNS,seatKeys:keys}),g=init();
 g.clock.t=5000;g.hp.p=45;g.combatAt.p=4700;g.hp.f=0;g.stats.b.guardUntil=6500;
 const input=pos();input.p.x=560;input.p.y=400;input.e.x=730;input.e.y=400;
 const d=ai.decide({game:g,positions:input,owner:'b',actor:{x:500,y:400,a:0},
  brain:{scope:'qa:1:0:0',nextShot:100000,nextSkill:0,path:[],nextPath:0},wallNow:5000});
 assert.notEqual(d.action,'gadget');
});
check('Guardian saves 7 actual HP on a 20-damage bullet',()=>{
 const g=impact();assert.equal(g.stats.b.guardSaved,7);
});
check('Guard does not protect the ally after they respawn into a new life',()=>{
 let g=init('area'),positions=pos();
 g.clock.t=100;g.clock.wallAt=100;g.stats.b.guardUntil=3200;g.stats.b.guardTargetId='p';g.stats.b.guardTargetLife=0;
 g.stats.p.life=1;positions.p.life=1;
 g.projectiles.h={id:'h',owner:'e',team:'red',x:460,y:400,vx:0,vy:0,dist:0,range:500,radius:6,damage:20,char:'gunner',spawnAt:0};
 g=core.step(g,positions,200,g.combatRev,'qa');assert.equal(g.hp.p,CHARS.gunner.hp-20);
});
check('Guardian does not mitigate gas damage',()=>{
 let g=init();g.clock.t=31000;g.clock.wallAt=31000;g.gasNextAt=31000;g.stats.b.guardUntil=34000;g.stats.b.guardTargetId='p';g.stats.b.guardTargetLife=0;
 const positions=pos();positions.p.x=19;positions.p.y=19;g=core.step(g,positions,31100,g.combatRev,'qa');
 assert.equal(g.hp.p,CHARS.gunner.hp-10);
});
check('Gunner burst timing preserved at 105ms',()=>{
 let g=init();g=core.accept(g,{eventId:'shot',owner:'p',matchId:'qa',round:1,seq:1,life:0,type:'shot',angle:0,reach:310,x:SPAWNS.blue1.x,y:SPAWNS.blue1.y,at:500},{},500);
 const bs=Object.values(g.projectiles);assert.equal(bs.length,3);
 assert.equal(bs[1].spawnAt-bs[0].spawnAt,105);assert.equal(bs[2].spawnAt-bs[1].spawnAt,105);
});
// AREA is an objective mode, not an endless chase mode. Bots must actually
// capture/hold while allies screen, and prioritize a visible enemy on the point.
function areaPlan({actor={x:380,y:430,a:0},ally={x:240,y:280},enemy={x:1250,y:430},enemy2={x:1340,y:490},mode='area'}={}){
 const ai=bot.create({chars:CHARS,walls:[],bushes:[],spawns:SPAWNS,seatKeys:keys,areaRadius:combat.balance.areaRadius});
 const g=init(mode);g.clock.t=5000;g.clock.wallAt=5000;
 const positions=pos();
 positions.p.x=ally.x;positions.p.y=ally.y;
 positions.e.x=enemy.x;positions.e.y=enemy.y;
 positions.f.x=enemy2.x;positions.f.y=enemy2.y;
 return ai.decide({game:g,positions,owner:'b',actor,brain:{},wallNow:5000});
}
check('AREA solo BOT captures instead of following a distant visible enemy',()=>{
 const plan=areaPlan();
 assert.equal(plan.brain.tactic,'capture');
 assert(Math.hypot(plan.brain.goal.x-768,plan.brain.goal.y-430)<combat.balance.areaRadius-20);
 assert(plan.move.dx>0,'bot heads toward zone');
});
check('AREA BOT holding an uncontested point does not chase distant enemies',()=>{
 const plan=areaPlan({actor:{x:735,y:430,a:0}});
 assert.equal(plan.brain.tactic,'hold');
 assert(Math.hypot(plan.brain.goal.x-768,plan.brain.goal.y-430)<combat.balance.areaRadius-20);
});
check('AREA BOT prioritizes visible enemies contesting the point over further duels',()=>{
 const plan=areaPlan({actor:{x:480,y:430,a:0},enemy:{x:770,y:400},enemy2:{x:650,y:430}});
 assert.equal(plan.targetId,'e','enemy occupying point outranks closer flanker');
 assert.equal(plan.brain.tactic,'contest');
});
check('AREA BOT screens forward if its teammate is already capturing',()=>{
 const plan=areaPlan({ally:{x:770,y:410}});
 assert.notEqual(plan.brain.tactic,'capture');
});
check('AREA BOT defends itself against a nearby attacker before forcing capture',()=>{
 const plan=areaPlan({actor:{x:400,y:430,a:0},enemy:{x:525,y:430}});
 assert.notEqual(plan.brain.tactic,'capture');
 assert.equal(plan.targetId,'e');
});
check('KO BOT remains duel-focused, not affected by capture priority',()=>{
 const plan=areaPlan({mode:'ko'});
 assert.notEqual(plan.brain.tactic,'capture');
});
check('UI carries explanation, practice gadget and guarded damage cues',()=>{
 for(const s of ['id="abilityGuide"','id="skillInfoPanel"','id="skillInfoToggle"','id="practiceGad"','id="mapExpand"','quietR41:true','#guardMeter,#guardAlert{display:none!important}'])assert(html.includes(s),'missing '+s);
});
console.log('Foundation V1 2vs2 '+count+' checks passed. Browser/iPad/network QA remains separate.');

// UI regression: blocked damage must never appear as center banners, counters, or floating shield text.
for(const forbidden of ["fillText('BLOCK '+", "fillText('SHIELD'", "'防御したダメージ '+", "'味方を守った！ +'"])assert(!html.includes(forbidden),'blocking UI reintroduced: '+forbidden);
console.log('PASS quiet UI gate: no shield text overlays or saved-damage counters');
