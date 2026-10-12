// Run from repository root: node tests/combat-evolution-smoke.cjs
// Pure logic tests only. Browser/Safari/Firebase tests are separate release gates.
'use strict';
const fs=require('node:fs');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const html=fs.readFileSync('2v2-combat-evolution-r2-test.html','utf8');
const script=html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
assert(script&&script.length>90000,'full embedded script must exist');
new vm.Script(script,{filename:'2v2-combat-evolution-test.html'});
const names=['SHARED STEALTH V1','COMBAT CORE','BOT CORE'];
let modules='';
for(const name of names){
 const a=script.indexOf('/* BEGIN '+name),b=script.indexOf('/* END '+name,a);
 assert(a>=0&&b>a,'missing '+name);
 modules+=script.slice(a,b)+'\n';
}
const sandbox={structuredClone};
vm.runInNewContext(modules,sandbox);
const {BrawlCombatV8:combat,BrawlBotV9:bot,BrawlStealthV1:stealth}=sandbox;
const start=script.indexOf('const CHARS='),end=script.indexOf('let WALLS=',start);
assert(start>0&&end>start,'character/map definitions');
const mapCode=script.slice(start,end);
const spawns=script.match(/^const SPAWNS=.*$/m)?.[0];
assert(spawns,'spawns');
const layout=new Function('BALANCE',mapCode+'\n'+spawns+'\nreturn {CHARS,KO_WALLS,KO_BUSHES,AREA_WALLS,AREA_BUSHES,SPAWNS};')(combat.balance);
const {CHARS,KO_WALLS,KO_BUSHES,AREA_WALLS,AREA_BUSHES,SPAWNS}=layout;
const seatKeys=['blue1','blue2','red1','red2'];
const seats={blue1:{id:'p',char:'gunner'},blue2:{id:'b',char:'tank'},red1:{id:'e',char:'sniper'},red2:{id:'f',char:'bomber'}};
function check(name,fn){fn();console.log('PASS',name);}
check('uniform movement and player radius',()=>{
 assert.equal(CHARS.gunner.speed,102);
 assert.equal(CHARS.tank.speed,102);
});
check('symmetric KO map and mist',()=>{
 for(const objs of [KO_WALLS,KO_BUSHES])for(const a of objs)
  assert(objs.some(b=>Math.abs(b.x-(1536-a.x-a.w))<2&&Math.abs(b.y-a.y)<2));
});
for(const [name,walls,bushes] of [['KO',KO_WALLS,KO_BUSHES],['AREA',AREA_WALLS,AREA_BUSHES]]){
 const core=combat.create({chars:CHARS,walls,spawns:SPAWNS,seatKeys});
 const ai=bot.create({chars:CHARS,walls,bushes,spawns:SPAWNS,seatKeys});
 let state=core.initialize(name,seats,name==='KO'?'ko':'area',0);
 state.hostToken='qa';
 check(name+' initializes four actors',()=>{
  assert.equal(Object.keys(state.hp).length,4);assert.equal(Object.keys(state.combatAt).length,4);
 });
 check(name+' routes reach midpoint',()=>{
  for(const p of Object.values(SPAWNS))assert(ai.route(p,{x:768,y:430}).length>0);
 });
 check(name+' authoritative stepping',()=>{
  for(let t=100;t<=1600;t+=100)state=core.step(state,{},t,state.combatRev,'qa');
  assert.equal(state.clock.t,1600);
 });
 check(name+' tactical BOT decision',()=>{
  const d=ai.decide({game:state,positions:{},owner:'b',actor:SPAWNS.blue2,level:'normal',brain:{},wallNow:100000});
  assert(d.brain.tactic&&Number.isFinite(d.angle));
 });
}
check('regen begins after three quiet seconds',()=>{
 const core=combat.create({chars:CHARS,walls:[],spawns:SPAWNS,seatKeys});
 let g=core.initialize('regen',seats,'ko',0);g.hostToken='qa';g.hp.p=40;
 for(let t=100;t<=3300;t+=100)g=core.step(g,{},t,g.combatRev,'qa');
 assert(g.hp.p>40&&g.hp.p<CHARS.gunner.hp);
});
check('gunner burst advances sequentially',()=>{
 const core=combat.create({chars:CHARS,walls:[],spawns:SPAWNS,seatKeys});
 let g=core.initialize('gunner',seats,'ko',0);g.hostToken='qa';
 for(let t=100;t<=500;t+=100)g=core.step(g,{},t,g.combatRev,'qa');
 g=core.accept(g,{eventId:'shot1',owner:'p',matchId:'gunner',round:1,life:0,seq:1,type:'shot',at:500,angle:0,reach:300,x:SPAWNS.blue1.x,y:SPAWNS.blue1.y},{},500);
 const b=Object.values(g.projectiles);
 assert.equal(b.length,3);assert.equal(b[1].spawnAt-b[0].spawnAt,105);
 assert.equal(b[2].spawnAt-b[1].spawnAt,105);
 g=core.step(g,{},600,g.combatRev,'qa');
 assert(g.projectiles['shot1:0'].dist>0);assert.equal(g.projectiles['shot1:1'].dist,0);
});
check('stealth visibility does not reveal far hidden actor',()=>{
 assert.equal(stealth.visible({viewer:{x:0,y:0},target:{x:400,y:200},concealed:true,now:5000}),false);
});

function r2Tactic({hp=20,hidden=false,mode='ko',recovering=false,pointBlank=false,lastSeen=true}={}){
 const core=combat.create({chars:CHARS,walls:[],spawns:SPAWNS,seatKeys});
 const g=core.initialize('r2',seats,mode,0);
 g.clock.t=5000;g.hp.p=hp;g.hp.f=0;g.stats.p.gadgets=0;g.stats.p.ult=0;
 const brain={scope:'r2:1:0:0',nextShot:0,nextSkill:1e9,path:[],nextPath:0,recovering,
  lastSeen:lastSeen?{x:750,y:400,id:'e',at:4900}:null};
 const ai=bot.create({chars:CHARS,walls:[],
  bushes:hidden?[{x:700,y:350,w:100,h:100}]:[],spawns:SPAWNS,seatKeys});
 return ai.decide({game:g,positions:{e:{x:pointBlank?625:750,y:400,matchId:'r2',round:1,life:0,motionRev:0}},
  owner:'p',actor:{x:550,y:400,a:0},brain,wallNow:5000});
}
check('R2 retreat stops firing to enable natural healing',()=>{
 const d=r2Tactic();assert.equal(d.brain.tactic,'recover');assert.equal(d.action,null);
});
check('R2 defensive close-range shot still permitted',()=>{
 const d=r2Tactic({pointBlank:true});assert.equal(d.brain.tactic,'recover');assert.equal(d.action,'shot');
});
check('R2 healing hides unseen enemy coordinates',()=>{
 const d=r2Tactic({hidden:true,recovering:true});
 assert.equal(d.targetId,null);assert.equal(d.brain.tactic,'recover');
 assert(d.brain.goal.x<500,'should retreat toward friendly side instead of last seen enemy');
});
check('R2 recovery overrides area capture when vulnerable',()=>{
 const d=r2Tactic({hidden:true,mode:'area',lastSeen:false});
 assert.equal(d.brain.tactic,'recover');
});
check('R2 bot re-engages above healing threshold',()=>{
 const d=r2Tactic({hp:85,recovering:true});
 assert.equal(d.brain.recovering,false);assert.equal(d.action,'shot');
});
check('R2 does not prematurely leave recovery at 60 percent HP',()=>{
 const d=r2Tactic({hp:60,recovering:true});
 assert.equal(d.brain.recovering,true);assert.equal(d.action,null);
});
check('1vs1 candidate remains present and syntactically valid',()=>{
 const duel=fs.readFileSync('1v1-combat-evolution-test.html','utf8');
 const i=duel.indexOf('<script>'),j=duel.indexOf('</script>',i);
 assert(i>=0&&j>i&&j-i>90000);
 new vm.Script(duel.slice(i+8,j),{filename:'1v1-combat-evolution-test.html'});
});


// These checks exercise win-state transitions without claiming a browser rematch was tested.
check('R2 KO: first round ends, second winning round ends the match',()=>{
 const core=combat.create({chars:CHARS,walls:[],spawns:SPAWNS,seatKeys});
 let first=core.initialize('ko-qa',seats,'ko',0);
 first.hostToken='qa';first.hp.e=0;first.hp.f=0;
 first=core.step(first,{},100,first.combatRev,'qa');
 assert.equal(first.phase,'round_end');assert.equal(first.winner,'blue');assert.equal(first.scores.blue,1);
 let second=core.initialize('ko-qa',seats,'ko',0);
 second.hostToken='qa';second.round=2;second.scores={...first.scores};second.hp.e=0;second.hp.f=0;
 second=core.step(second,{},100,second.combatRev,'qa');
 assert.equal(second.phase,'match_end');assert.equal(second.winner,'blue');assert.equal(second.scores.blue,2);
});
check('R2 AREA: valid uncontested capture finishes the match',()=>{
 const core=combat.create({chars:CHARS,walls:[],spawns:SPAWNS,seatKeys});
 let g=core.initialize('area-qa',seats,'area',0);
 g.hostToken='qa';g.area.blueMs=59950;g.hp.e=0;g.hp.f=0;
 g.clock.t=59900;g.clock.wallAt=100000;
 const inputs={p:{x:768,y:430,life:0,motionRev:0},b:{x:755,y:432,life:0,motionRev:0}};
 g=core.step(g,inputs,100100,g.combatRev,'qa');
 assert.equal(g.phase,'match_end');assert.equal(g.winner,'blue');assert.equal(g.area.blueMs,60000);
});

console.log('BRAWL R2 regression suite passed. Browser/iPad/online QA still required.');
