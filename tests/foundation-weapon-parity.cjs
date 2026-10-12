// Compare ACTUAL 1vs1 volley and 2vs2 reducer shot creation.
'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const c=JSON.parse(fs.readFileSync('shared/brawl-core-contract.json','utf8'));
const scripts=['1v1','2v2'].map(x=>fs.readFileSync('foundation/'+x+'-foundation-v1.html','utf8').match(/<script>([\s\S]*?)<\/script>/)[1]);
const slice=(s,start,end)=>{const a=s.indexOf(start),b=s.indexOf(end,a);assert(a>=0&&b>a,'missing '+start);return s.slice(a,b)};
const extract=(s,name)=>{const a=s.indexOf('function '+name+'(');assert(a>=0,'missing '+name);let n=0,start=s.indexOf('{',a);for(let i=start;i<s.length;i++){if(s[i]==='{')n++;if(s[i]==='}'&&!--n)return s.slice(a,i+1);}throw Error('unbalanced '+name)};
const weapon=slice(scripts[0],'/* BEGIN SHARED WEAPON RULES */','/* END SHARED WEAPON RULES */');
function legacy(overdrive,char){
 const helpers=[
  'let game={round:1,phase:"playing"},role="host";',
  'let local={overdrive:'+overdrive+'},remote={overdrive:0},botBrain={overdrive:0};',
  'const calls=[],timers=[];',
  'const emitOneShot=(owner,x,y,angle,ult,round)=>calls.push({owner,x,y,angle,ult,round});',
  'const setTimeout=(send,delay)=>timers.push({send,delay});',
  'const isPlaying=()=>true,markAttack=()=>{},throwBomb=()=>{};'
 ].join('\n');
 const h=vm.runInNewContext(weapon+'\n'+helpers+'\n'+extract(scripts[0],'actorOverdrive')+'\n'+extract(scripts[0],'fireVolley')+'\n({game,fireVolley,calls,timers})');
 h.fireVolley('host',char,300,280,0,false);
 const delays=[0,...h.timers.map(t=>t.delay)];
 for(const timer of h.timers)timer.send();
 return {calls:h.calls,delays};
}
const near=(a,b,m)=>assert(Math.abs(a-b)<0.000001,m+': '+a+' vs '+b);
const tank=legacy(0,'tank');assert.equal(tank.calls.length,5);
tank.calls.forEach((shot,i)=>near(shot.angle,c.common.weaponRules.tankSpread[i],'1v1 tank angle'));
const gun=legacy(0,'gunner');assert.equal(gun.calls.length,3);
assert.deepEqual(gun.delays,[0,105,210]);
gun.calls.forEach((shot,i)=>{near(shot.angle,c.common.weaponRules.gunnerSpread[i],'1v1 gunner angle');assert.equal(shot.x,300);assert.equal(shot.y,280)});
assert.deepEqual(legacy(5,'gunner').delays,[0,57,114]);
const module2=slice(scripts[1],'/* BEGIN COMBAT CORE','/* END COMBAT CORE');
const weapon2=slice(scripts[1],'/* BEGIN SHARED WEAPON RULES */','/* END SHARED WEAPON RULES */');
const match2=slice(scripts[1],'/* BEGIN SHARED MATCH STATE */','/* END SHARED MATCH STATE */');
const ability2=slice(scripts[1],'/* BEGIN SHARED ABILITIES */','/* END SHARED ABILITIES */');
const env={structuredClone};vm.runInNewContext(module2+'\n'+weapon2+'\n'+match2+'\n'+ability2,env);
const a=scripts[1].indexOf('const CHARS='),b=scripts[1].indexOf('let WALLS=',a),sp=scripts[1].match(/^const SPAWNS=.*$/m)?.[0];
assert(a>=0&&b>a&&sp,'character block');
const {CHARS,SPAWNS}=new Function('BALANCE',scripts[1].slice(a,b)+'\n'+sp+'\nreturn {CHARS,SPAWNS}')(env.BrawlCombatV8.balance);
const seats=['blue1','blue2','red1','red2'];
function host(char,overdrive){
 const players={blue1:{id:'p',char},blue2:{id:'b',char:'tank'},red1:{id:'e',char:'sniper'},red2:{id:'f',char:'bomber'}};
 const core=env.BrawlCombatV8.create({chars:CHARS,walls:[],spawns:SPAWNS,seatKeys:seats});
 let g=core.initialize('qa',players,'ko',0);g.stats.p.overdriveUntil=overdrive?5000:0;
 g=core.accept(g,{eventId:'shot',owner:'p',matchId:'qa',round:1,seq:1,life:0,type:'shot',angle:0,x:300,y:280,reach:310,at:200},{p:{x:300,y:280,motionRev:0,life:0}},200);
 assert.equal(g.usedActions.shot.status,'accepted');
 return Object.values(g.projectiles).sort((a,b)=>a.spawnAt-b.spawnAt);
}
const t2=host('tank',false),g2=host('gunner',false),go2=host('gunner',true);
assert.equal(t2.length,5);assert.equal(g2.length,3);
t2.forEach((x,i)=>near(Math.atan2(x.vy,x.vx),tank.calls[i].angle,'cross-mode tank'));
g2.forEach((x,i)=>{
 near(Math.atan2(x.vy,x.vx),gun.calls[i].angle,'cross-mode gunner');
 near(x.x,328,'muzzle initial x');near(x.y,280,'muzzle initial y');
 assert.equal(x.spawnAt-g2[0].spawnAt,gun.delays[i],'cross-mode burst delay');
});
go2.forEach((x,i)=>assert.equal(x.spawnAt-go2[0].spawnAt,[0,57,114][i]));
const shared=vm.runInNewContext(weapon+'\nBrawlWeaponV1');
assert.equal(shared.overdriveReloadMs,c.common.weaponRules.gunnerOverdriveReloadMs);
assert.equal(shared.sniperKnockback,c.common.weaponRules.sniperGadgetKnockback);
console.log('PASS cross-mode REAL volley: tank fan, gunner 3-shot angle, 105/57 ms timing, initial muzzle x/y, shared reload and sniper knockback');
