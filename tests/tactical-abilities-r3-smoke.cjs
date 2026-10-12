// Standalone R3 regression: run from repo root with Node >=22.
// Pure reducer/BOT tests + script parsing. Not a browser, iPad or Firebase verification.
'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync('2v2-tactical-abilities-r3-test.html','utf8');
const script=html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
assert(script&&script.length>100000,'R3 complete inline script');
new vm.Script(script,{filename:'2v2-tactical-abilities-r3-test.html'});
const env={structuredClone};
for(const name of ['SHARED STEALTH V1','COMBAT CORE','BOT CORE']){
 const a=script.indexOf('/* BEGIN '+name),b=script.indexOf('/* END '+name,a);
 assert(a>=0&&b>a,'module '+name);
 vm.runInNewContext(script.slice(a,b),env,{filename:name});
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
 g.stats.b.guardUntil=guardUntil;if(!tankAlive)g.hp.b=0;
 if(enemyGuard){g.stats.b.guardUntil=0;g.stats.e.char='tank';g.stats.e.guardUntil=guardUntil;positions.e.x=440;positions.e.y=400;}
 if(farTank){positions.b.x=100;positions.b.y=100;}
 g.projectiles.h={id:'h',owner:'e',ownerLife:0,team:'red',x:460,y:400,vx:0,vy:0,dist:0,range:800,radius:6,damage:20,char:'gunner',spawnAt:0};
 return core.step(g,positions,hitAt,g.combatRev,'qa');
}
check('R3 script parses and original movement stays intact',()=>{
 assert.equal(CHARS.gunner.speed,102);assert.equal(CHARS.tank.speed,102);assert.equal(CHARS.sniper.speed,102);
});
check('Tank gadget consumes one charge, dashes, activates 2.2s guard',()=>{
 let g=init();g=core.accept(g,{eventId:'skill',owner:'b',matchId:'qa',round:1,seq:1,life:0,type:'gadget',angle:0,reach:310,x:SPAWNS.blue2.x,y:SPAWNS.blue2.y,at:200},{},200);
 assert.equal(g.usedActions.skill.status,'accepted');assert.equal(g.stats.b.gadgets,1);
 assert.equal(g.stats.b.guardUntil,2200);assert.equal(g.motions.b.rev,1);
});
check('Nearby ally receives 30% less bullet damage',()=>{
 const g=impact();assert.equal(g.hp.p,CHARS.gunner.hp-14);
 assert(Object.values(g.events).some(e=>e.type==='hit'&&e.guarded&&e.amount===14));
});
check('Guard protects tank owner too',()=>{
 let g=init();g.stats.b.guardUntil=2400;g.projectiles.h={id:'h',owner:'e',team:'red',x:400,y:400,vx:0,vy:0,dist:0,range:600,radius:6,damage:20,char:'gunner',spawnAt:0};
 g=core.step(g,pos(),100,g.combatRev,'qa');assert.equal(g.hp.b,CHARS.tank.hp-14);
});
check('Expired guard does not reduce damage',()=>assert.equal(impact({guardUntil:200}).hp.p,CHARS.gunner.hp-20));
check('Dead guardian cannot protect',()=>assert.equal(impact({tankAlive:false}).hp.p,CHARS.gunner.hp-20));
check('Guardian too far away does not protect',()=>assert.equal(impact({farTank:true}).hp.p,CHARS.gunner.hp-20));
check('Enemy guardian cannot protect opposing team',()=>assert.equal(impact({enemyGuard:true}).hp.p,CHARS.gunner.hp-20));
check('Guard works under AREA combat rules too',()=>assert.equal(impact({mode:'area'}).hp.p,CHARS.gunner.hp-14));
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
check('Gunner burst timing preserved at 105ms',()=>{
 let g=init();g=core.accept(g,{eventId:'shot',owner:'p',matchId:'qa',round:1,seq:1,life:0,type:'shot',angle:0,reach:310,x:SPAWNS.blue1.x,y:SPAWNS.blue1.y,at:500},{},500);
 const bs=Object.values(g.projectiles);assert.equal(bs.length,3);
 assert.equal(bs[1].spawnAt-bs[0].spawnAt,105);assert.equal(bs[2].spawnAt-bs[1].spawnAt,105);
});
check('UI carries explanation, practice gadget and guarded damage cues',()=>{
 for(const s of ['id="abilityGuide"','id="skillInfoPanel"','id="skillInfoToggle"','id="practiceGad"','id="myBuff"',"f.guarded?'GUARD -'"])assert(html.includes(s),'missing '+s);
});
console.log('R3 '+count+' checks passed. Browser/iPad/network QA remains separate.');
