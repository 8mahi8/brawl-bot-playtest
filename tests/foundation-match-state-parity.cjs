// Deterministic 1vs1/2vs2 match state contract. No network or browser needed.
'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const modes=['1v1','2v2'];
const scripts=modes.map(mode=>fs.readFileSync('foundation/'+mode+'-foundation-v1.html','utf8').match(/<script>([\s\S]*?)<\/script>/)?.[1]);
assert(scripts.every(Boolean),'both generated games must contain complete inline JS');
function extract(script,a,b){const i=script.indexOf(a),j=script.indexOf(b,i);assert(i>=0&&j>i,'missing '+a);return script.slice(i,j);}
const source=scripts.map(s=>extract(s,'/* BEGIN SHARED MATCH STATE */','/* END SHARED MATCH STATE */'));
assert.equal(source[0],source[1],'each game must embed identical real match-state code');
const modules=source.map(src=>vm.runInNewContext(src+'\nBrawlMatchV1'));
const balance=JSON.parse(fs.readFileSync('shared/brawl-core-contract.json','utf8')).common.balance;
let checks=0;
function check(label,fn){for(const [index,api] of modules.entries())fn(api,modes[index]);checks++;console.log('PASS '+label);}
function fixture(){
 return {mode:'ko',phase:'playing',hp:{p:100,a:80,e:70,f:90},stats:{
  p:{char:'gunner',ult:0,life:0},a:{char:'tank',ult:0,life:0,guardSaved:0},
  e:{char:'sniper',ult:0,life:0},f:{char:'bomber',ult:0,life:0}},
  reveals:{},debuffs:{},scores:{blue:0,red:0},protection:{},area:{blueMs:0,redMs:0,contested:false,occupants:{blue:0,red:0}},
  seats:{blue1:{id:'p'},blue2:{id:'a'},red1:{id:'e'},red2:{id:'f'}}
 };
}
const hit={owner:'e',victim:'p',amount:20,key:'shot'};
const result=(api,g,opts)=>api.applyHit(g,hit,1000,balance,opts);
check('Direct 20-point hit updates HP, attack/received ULT and reveal',api=>{
 const g=fixture(),r=result(api,g);
 assert.equal(r.amount,20);assert.equal(g.hp.p,80);
 assert.equal(g.stats.e.ult,9.6);assert.equal(g.stats.p.ult,4.8);assert.equal(g.reveals.p,2500);
});
check('Overkill hits cannot push health negative or overcharge ULT',api=>{
 const g=fixture();g.hp.p=5;g.stats.e.ult=99;g.stats.p.ult=99;
 const r=result(api,g);
 assert.equal(r.amount,5);assert.equal(g.hp.p,0);
 assert.equal(g.stats.e.ult,100);assert.equal(g.stats.p.ult,100);
 assert.equal(api.applyHit(g,hit,1500,balance),null);
});
check('Guardian reduces hit damage and records actual saved health',api=>{
 const g=fixture(),r=result(api,g,{guardian:'a'});
 assert.equal(r.amount,13);assert.equal(r.saved,7);assert.equal(g.hp.p,87);
 assert.equal(g.stats.a.guardSaved,7);assert.equal(g.stats.p.ult,13*.24);
});
check('Enhanced shot records accurate bomber DOT and slow timings',api=>{
 const g=fixture(),r=api.applyHit(g,{...hit,enhanced:true,key:'bombX'},1000,balance);
 assert.equal(r.amount,20);assert.equal(g.debuffs.p.dotId,'bombX');
 assert.equal(g.debuffs.p.slowUntil,2500);assert.equal(g.debuffs.p.dotUntil,4000);
 assert.equal(g.debuffs.p.dotNextAt,2000);
});
const seats=['blue1','blue2','red1','red2'];const teams=k=>k.startsWith('blue')?'blue':'red';
const position={p:{x:500,y:300},a:{x:500,y:300},e:{x:530,y:300},f:{x:800,y:500}};
const resolve=(api,g,{now=1000,dt=100,center={x:500,y:300}}={})=>api.resolve(g,{
 seatKeys:seats,teamOf:teams,targets:position,flying:()=>false,center,dt,t:now,wallNow:now,balance:{...balance,areaRadius:118,areaCaptureMs:60000,areaLimitMs:180000}
});
check('KO requires complete enemy team defeat and awards round one',api=>{
 const g=fixture();g.hp.e=0;resolve(api,g);assert.equal(g.phase,'playing');
 g.hp.f=0;const winner=resolve(api,g);assert.equal(winner,'blue');assert.equal(g.phase,'round_end');
 assert.equal(g.scores.blue,1);
});
check('Second KO win completes match while double KO draws',api=>{
 const g=fixture();g.hp.e=0;g.hp.f=0;g.scores.blue=1;
 resolve(api,g);assert.equal(g.phase,'match_end');assert.equal(g.scores.blue,2);
 const d=fixture();d.hp.p=0;d.hp.a=0;d.hp.e=0;d.hp.f=0;
 resolve(api,d);assert.equal(d.winner,'draw');assert.equal(d.phase,'round_end');assert.equal(d.scores.red,0);
});
check('AREA capture blocked when contested, then progresses when unopposed',api=>{
 const g=fixture();g.mode='area';g.hp.f=0;
 resolve(api,g,{dt:500});assert.equal(g.area.contested,true);assert.equal(g.area.blueMs,0);
 g.hp.e=0;resolve(api,g,{dt:500});
 assert.equal(g.area.contested,false);assert.equal(g.area.blueMs,500);
});
check('AREA excludes spawn protected allies and handles timeout draws',api=>{
 const g=fixture();g.mode='area';g.hp.e=0;g.hp.f=0;g.protection.p=2500;g.protection.a=2500;
 resolve(api,g,{now:1000,dt:200});assert.equal(g.area.blueMs,0);
 g.area.blueMs=20000;g.area.redMs=20000;
 resolve(api,g,{now:180000,dt:0});
 assert.equal(g.winner,'draw');assert.equal(g.phase,'match_end');
});
check('Regen prevents healing after KO, caps at max and rounds to hundredths',api=>{
 assert.equal(api.regenAmount(0,100,1000),0);
 assert.equal(api.regenAmount(98,100,1000),100);
 assert.equal(api.regenAmount(50,100,125),51.5);
 assert.equal(api.regenAmount(50,100,125,{precision:null}),51.5);
 assert.equal(api.regenAmount(50.123,100,125,{precision:1}),51.6);
 assert.equal(api.regenAmount(30,100,400,{precision:null}),34.8);
 assert.equal(api.regenAmount(30,100,500,{precision:1}),36);
});
assert(scripts[0].includes('BrawlMatchV1.regenAmount(game.hp[who],maximum,Math.min(now-t,400)'),'1vs1 solo actually uses shared HP regeneration');
assert(scripts[0].includes('BrawlMatchV1.regenAmount(hp[who],maximum,Math.min(now-t,500)'),'1vs1 candidate online transaction uses shared regen arithmetic');
for(const [i,s] of scripts.entries()){
 assert.equal((s.match(/BrawlMatchV1\.applyHit\(g,/g)||[]).length,1,modes[i]+' uses single damage manager');
 assert.equal((s.match(/BrawlMatchV1\.resolve\(g,/g)||[]).length,1,modes[i]+' uses single match resolver');
}
assert(scripts[1].includes('BrawlMatchV1.regenAmount(hp,chars[st.char].hp,dt)'),'2vs2 real regen uses common arithmetic');
console.log('PASS '+checks+' contract groups across BOTH mode builds + real reducer wiring');
