// True cross-mode projectile parity, plus tunneling, hitbox boundary and damage tests.
'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const games=['1v1','2v2'].map(mode=>{
 const script=fs.readFileSync('foundation/'+mode+'-foundation-v1.html','utf8').match(/<script>([\s\S]*?)<\/script>/)?.[1];
 assert(script,'standalone script '+mode);
 const extract=(a,b)=>{const start=script.indexOf(a),end=script.indexOf(b,start);assert(start>=0&&end>start,'missing '+a+' '+mode);return script.slice(start,end)};
 return {mode,script,core:extract('/* BEGIN COMBAT CORE','/* END COMBAT CORE'),
  weapons:extract('/* BEGIN SHARED WEAPON RULES */','/* END SHARED WEAPON RULES */'),
  physics:extract('/* BEGIN SHARED PROJECTILE PHYSICS */','/* END SHARED PROJECTILE PHYSICS */'),
  match:extract('/* BEGIN SHARED MATCH STATE */','/* END SHARED MATCH STATE */'),
  ability:extract('/* BEGIN SHARED ABILITIES */','/* END SHARED ABILITIES */')};
});
assert.equal(games[0].physics,games[1].physics,'both actual games embed the same physics source');
for(const g of games){
 const ctx={structuredClone};
 vm.runInNewContext(g.core+'\n'+g.weapons+'\n'+g.physics+'\n'+g.match+'\n'+g.ability+
   '\nthis.physics=BrawlProjectileV1;this.weaponRules=BrawlWeaponV1;',ctx,{filename:g.mode});
 g.runtime=ctx;
}
let checks=0;
function check(label,fn){fn();checks++;console.log('PASS '+label);}
const physics=games[0].runtime.physics;
check('Sniper damage distance falloff and non-scaling ULT',()=>{
 assert.equal(physics.damage({char:'sniper',dist:100,damage:36},()=>11),43);
 assert.equal(physics.damage({char:'sniper',dist:300,damage:36},()=>11),56);
 assert.equal(physics.damage({char:'sniper',ult:true,dist:300,damage:60},()=>11),60);
 assert.equal(physics.damage({char:'tank',dist:120,damage:11},()=>7),7);
 assert.equal(physics.damage({char:'gunner',dist:60,damage:10},()=>7),10);
});
check('Shared circle intersection handles exact contact consistently',()=>{
 assert(physics.hitCircle(10,20,16,28,10)); // distance 10
 assert(!physics.hitCircle(10,20,16.01,28,10));
});
const makeBullet=()=>({x:40,y:100,vx:660,vy:0,dist:0,range:500,radius:6,damage:20,char:'gunner'});
check('High-speed bullet collides with thin wall instead of tunneling',()=>{
 const b=makeBullet();
 const active=physics.advance(b,.1,{width:500,height:300,wallHit:(x,y,r)=>x+r>80&&x-r<83&&y>70&&y<130,targetHit:()=>false});
 assert.equal(active,false);assert(b.x<90,'removed after wall impact');
});
check('Bullet respects range boundary before attempting late hits',()=>{
 const b=makeBullet();b.range=20;let hit=false;
 const active=physics.advance(b,.2,{width:500,height:300,wallHit:()=>false,targetHit:()=>{hit=true;return true},rangeFirst:true});
 assert.equal(active,false);
 assert.equal(hit,true,'bullet may hit before reaching its max range');
 const short=makeBullet();short.range=1;let called=false;
 physics.advance(short,.1,{width:500,height:300,wallHit:()=>false,targetHit:()=>{called=true;return true},rangeFirst:true});
 assert.equal(called,false,'expired bullet cannot hit outside its max range');
});
function coreFixture(g,shot){
 const seatKeys=['blue1','red1'];
 const seats={blue1:{id:'p',char:'gunner'},red1:{id:'e',char:'sniper'}};
 const spawns={blue1:{x:100,y:100,a:0},red1:{x:400,y:100,a:0}};
 const chars={gunner:{hp:100,reload:1250,damage:10,range:280},sniper:{hp:70,reload:1833,damage:36,range:455}};
 const core=g.runtime.BrawlCombatV8.create({chars,walls:[],spawns,seatKeys});
 let state=core.initialize('test',seats,'ko',0);state.hostToken='token';
 state.projectiles.shot={id:'shot',owner:'e',ownerLife:0,team:'red',x:200,y:100,vx:0,vy:0,dist:shot.dist||0,range:500,radius:6,damage:shot.damage||20,char:shot.char||'gunner',spawnAt:0};
 const input={p:{x:200,y:100,life:0,motionRev:0,matchId:'test',round:1},e:{x:400,y:100,life:0,motionRev:0,matchId:'test',round:1}};
 return core.step(state,input,100,state.combatRev,'token');
}
check('Actual host reducers of both modes apply identical gunner damage',()=>{
 const a=coreFixture(games[0],{char:'gunner',damage:20});
 const b=coreFixture(games[1],{char:'gunner',damage:20});
 assert.equal(a.hp.p,80);assert.equal(b.hp.p,80);
 assert.equal(Object.values(a.events).find(x=>x.type==='hit').amount,20);
 assert.equal(Object.values(b.events).find(x=>x.type==='hit').amount,20);
});
check('Actual host reducers of both modes apply identical sniper scaling',()=>{
 const a=coreFixture(games[0],{char:'sniper',dist:100});
 const b=coreFixture(games[1],{char:'sniper',dist:100});
 assert.equal(a.hp.p,57);assert.equal(b.hp.p,57);
});
check('Both standalone scripts and legacy 1vs1 shooting use shared physics API',()=>{
 assert(games[0].script.includes('return BrawlProjectileV1.advance(b,dt,{'),'1vs1 actual renderer');
 assert(games[1].script.includes('const aliveBullet=BrawlProjectileV1.advance(bullet,activeSec,{'),'2vs2 actual renderer');
 assert(games[0].script.includes('const alive=BrawlProjectileV1.advance(b,dt/1000,{'),'1vs1 reducer');
 assert(games[1].script.includes('const alive=BrawlProjectileV1.advance(b,activeMs/1000,{'),'2vs2 reducer');
});
console.log('PASS all '+checks+' cross-mode projectile checks, no Firebase contact');
