// V1.4 cross-mode ability regression: real V8 host action acceptance in both generated games.
'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const config=JSON.parse(fs.readFileSync('shared/brawl-core-contract.json','utf8')).common.abilityRules;
const names=['1v1','2v2'],games=[];
for(const mode of names){
 const html=fs.readFileSync('foundation/'+mode+'-foundation-v1.html','utf8');
 const script=html.match(/<script>([\s\S]*?)<\/script>/)?.[1];assert(script);
 const part=(start,end)=>{const i=script.indexOf(start),j=script.indexOf(end,i);assert(i>=0&&j>i,mode+' missing '+start);return script.slice(i,j)};
 const ctx={structuredClone};
 const sources=[
  part('/* BEGIN COMBAT CORE','/* END COMBAT CORE'),
  part('/* BEGIN SHARED WEAPON RULES */','/* END SHARED WEAPON RULES */'),
  part('/* BEGIN SHARED PROJECTILE PHYSICS */','/* END SHARED PROJECTILE PHYSICS */'),
  part('/* BEGIN SHARED MATCH STATE */','/* END SHARED MATCH STATE */'),
  part('/* BEGIN SHARED ABILITIES */','/* END SHARED ABILITIES */')
 ];
 vm.runInNewContext(sources.join('\n')+'\nthis.abilities=BrawlAbilityV1;',ctx);
 const chars={
  tank:{hp:180,reload:833.333333333,damage:11,range:160},gunner:{hp:100,reload:1250,damage:10,range:280},
  sniper:{hp:70,reload:1833.3333333,damage:36,range:455},bomber:{hp:90,reload:1500,damage:28,range:300}
 };
 const seatKeys=['blue1','blue2','red1','red2'];
 const spawns={blue1:{x:300,y:250},blue2:{x:260,y:260},red1:{x:390,y:250},red2:{x:700,y:410}};
 const core=ctx.BrawlCombatV8.create({chars,walls:[],spawns,seatKeys});
 function init(char){
  const seats={blue1:{id:'p',char},blue2:{id:'a',char:'tank'},red1:{id:'e',char:'gunner'},red2:{id:'f',char:'bomber'}};
  const g=core.initialize('qa',seats,'ko',0);g.hostToken='qa';return g;
 }
 function invoke(char,type,mutate=()=>{},extra={}){
  const g=init(char);mutate(g);
  const action={eventId:'skill',owner:'p',matchId:'qa',round:1,seq:1,life:0,type,angle:0,reach:310,x:300,y:250,at:200,...extra};
  const result=core.accept(g,action,{},200);return {before:g,after:result,receipt:result.usedActions?.skill};
 }
 games.push({mode,script,core,init,invoke,abilities:ctx.abilities});
}
const source=(mode)=>games.find(g=>g.mode===mode);
const reg=source('1v1').script.slice(source('1v1').script.indexOf('/* BEGIN SHARED ABILITIES */'),source('1v1').script.indexOf('/* END SHARED ABILITIES */'));
const second=source('2v2').script.slice(source('2v2').script.indexOf('/* BEGIN SHARED ABILITIES */'),source('2v2').script.indexOf('/* END SHARED ABILITIES */'));
assert.equal(reg,second,'both standalone modes must use literally identical ability source');
let cases=0;const check=(name,fn)=>{for(const g of games)fn(g);cases++;console.log('PASS '+name)};
check('Gunner gadget reloads 3 ammo and starts 3-second boost',g=>{
 const {after,receipt}=g.invoke('gunner','gadget',s=>{s.stats.p.ammo=1;s.stats.p.refillAt=2222;});
 assert.equal(receipt.status,'accepted');assert.equal(after.stats.p.gadgets,1);
 assert.equal(after.stats.p.ammo,3);assert.equal(after.stats.p.refillAt,0);
 assert.equal(after.stats.p.boostUntil,config.gunnerGadgetBoostMs);
});
check('Bomber gadget loads one round and arms exactly one enhanced shot',g=>{
 const {after,receipt}=g.invoke('bomber','gadget',s=>{s.stats.p.ammo=2;s.stats.p.refillAt=900;});
 assert.equal(receipt.status,'accepted');assert.equal(after.stats.p.ammo,3);assert.equal(after.stats.p.refillAt,0);
 assert.equal(after.stats.p.armed,true);
 const failed=g.invoke('bomber','gadget',s=>{s.stats.p.armed=true;});
 assert.equal(failed.receipt.status,'rejected');
 assert.equal(failed.after.stats.p.gadgets,2);
});
check('Sniper gadget schedules knockback/shock for in-range enemy only',g=>{
 const {after,receipt}=g.invoke('sniper','gadget');
 assert.equal(receipt.status,'accepted');
 assert(after.scheduled['skill:e']?.kind==='shock');
 assert.equal(after.scheduled['skill:e'].damage,config.sniperGadgetDamage);
 assert.equal(after.scheduled['skill:f'],undefined);
 assert(after.motions.e.rev>0,'enemy motion changed by knockback');
 assert.equal(after.stats.p.gadgets,1);
});
check('Zero gadgets cannot invoke skill and receipt remains rejected',g=>{
 const {after,receipt}=g.invoke('gunner','gadget',s=>s.stats.p.gadgets=0);
 assert.equal(receipt.status,'rejected');assert.equal(after.stats.p.gadgets,0);
 assert.equal(after.stats.p.boostUntil,0);
});
check('Gunner ultimate turns on 5-second overdrive and consumes ULT',g=>{
 const {after,receipt}=g.invoke('gunner','ultimate',s=>s.stats.p.ult=100);
 assert.equal(receipt.status,'accepted');assert.equal(after.stats.p.ult,0);
 assert.equal(after.stats.p.overdriveUntil,config.gunnerUltOverdriveMs);
});
check('Sniper ultimate schedules one laser with shared lifetime',g=>{
 const {after,receipt}=g.invoke('sniper','ultimate',s=>s.stats.p.ult=100);
 assert.equal(receipt.status,'accepted');assert.equal(after.scheduled.skill.kind,'laser');
 assert.equal(after.scheduled.skill.until,config.sniperLaserMs);
});
check('Bomber ultimate schedules three properly staggered bombs',g=>{
 const {after,receipt}=g.invoke('bomber','ultimate',s=>s.stats.p.ult=100);
 assert.equal(receipt.status,'accepted');
 const bombs=Object.values(after.scheduled);assert.equal(bombs.length,config.bomberUltProjectiles);
 assert(bombs.every(b=>b.kind==='bomb'&&b.owner==='p'));
 bombs.forEach((b,i)=>assert.equal(b.start,i*400));
});
check('Tank ultimate schedules jump, with gadget still mode-specific',g=>{
 const {after,receipt}=g.invoke('tank','ultimate',s=>s.stats.p.ult=100);
 assert.equal(receipt.status,'accepted');assert.equal(after.scheduled.skill.kind,'jump');
 assert(after.scheduled.skill.until>0);
 const dash=g.invoke('tank','gadget');
 assert.equal(dash.receipt.status,'accepted');
 assert(dash.after.motions.p.rev>0,'dash occurs in either mode');
 if(g.mode==='1v1')assert.equal(dash.after.stats.p.guardUntil,undefined);
 else {assert.equal(dash.after.stats.p.guardUntil,config.guardianLinkMs);assert.equal(dash.after.stats.p.guardTargetId,'a');}
});
check('Insufficient ULT is rejected without spending resource',g=>{
 const {after,receipt}=g.invoke('bomber','ultimate',s=>s.stats.p.ult=99);
 assert.equal(receipt.status,'rejected');assert.equal(after.stats.p.ult,99);
 assert.equal(Object.keys(after.scheduled).length,0);
});
check('Rejected stale life and duplicate requests cannot spend resources twice',g=>{
 const fixture=g.init('gunner'),action={eventId:'double',owner:'p',matchId:'qa',round:1,seq:1,life:0,type:'gadget',angle:0,reach:310,x:300,y:250,at:200};
 const first=g.core.accept(fixture,action,{},200),second=g.core.accept(first,action,{},250);
 assert.equal(first.stats.p.gadgets,1);assert.equal(second.stats.p.gadgets,1);
 const third=g.core.accept(first,{...action,eventId:'stale',seq:2,life:1},{},300);
 assert.equal(third.usedActions.stale.status,'rejected');assert.equal(third.stats.p.gadgets,1);
});
console.log('PASS '+cases+' ability categories in EACH mode, real authoritative accept and mode-specific Tank GAD retained');
