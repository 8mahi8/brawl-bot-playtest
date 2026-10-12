'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const spec=JSON.parse(fs.readFileSync('shared/brawl-core-contract.json','utf8'));
const files=spec.sourceCandidates;
function object(src,key){
 const m=new RegExp('\\bconst\\s+'+key+'\\s*=\\s*\\{').exec(src);assert(m,'missing '+key);
 let i=m.index+m[0].length-1,depth=0,start=i;
 for(;i<src.length;i++){if(src[i]==='{')depth++;if(src[i]==='}'&&!--depth)break;}
 assert(depth===0,'unbalanced '+key);
 return src.slice(start,i+1);
}
function near(a,b,what,tol=0){assert(typeof a==='number'&&Number.isFinite(a)&&Math.abs(a-b)<=tol,what+' expected '+b+' got '+a);}
function check(src,mode){
 const BALANCE=vm.runInNewContext('('+object(src,'BALANCE')+')');
 const CHARS=vm.runInNewContext('('+object(src,'CHARS')+')',{BALANCE});
 const c=spec.common;
 const radius=mode==='1vs1'?
  src.match(/\bW\s*=\s*1000\s*,\s*H\s*=\s*600\s*,\s*RADIUS\s*=\s*(\d+)/):
  src.match(/\bW\s*=\s*1536\s*,\s*H\s*=\s*860\s*,\s*R\s*=\s*(\d+)/);
 assert(radius,mode+' body radius source');
 near(+radius[1],c.playerRadius,mode+' body radius');
 const stealth=src.match(/\bconst\s+RADIUS\s*=\s*(\d+)\s*,\s*regionCache/);
 assert(stealth,mode+' stealth source');near(+stealth[1],c.stealthDetectRadius,mode+' stealth range');
 for(const [name,defaults]of Object.entries(c.characters)){
  assert(CHARS[name],mode+' missing '+name);
  for(const [key,value]of Object.entries({hp:defaults.hp,speed:c.movementSpeed,damage:defaults.baseDamage,range:defaults.range}))
   near(CHARS[name][key],value,mode+'.'+name+'.'+key);
  near(CHARS[name].reload*(mode==='1vs1'?1000:1),defaults.reloadMs,mode+'.'+name+'.reload',1);
 }
 for(const [key,value]of Object.entries(c.balance))near(BALANCE[key],value,mode+'.balance.'+key);
 if(mode==='1vs1'){
  assert(/GAS_DELAY\s*=\s*28\s*,\s*GAS_SPEED\s*=\s*9/.test(src),'1v1 gas speed');
  assert(/REGEN_DELAY\s*=\s*3000\s*,\s*REGEN_RATE\s*=\s*\.12/.test(src),'1v1 regeneration');
  assert(src.includes('actorOverdrive(owner)>0?57:105'),'1v1 gunner burst');
  assert(src.includes('superGainDealt(d){return Math.max(0,d)*.48;}'),'1v1 damage->ULT');
  assert(src.includes("superGainTaken(d,char){return Math.max(0,d)*(char==='tank'?.44:.24);}"),'1v1 damage taken->ULT');
 }else{
  assert(src.includes('GAS_DELAY=28_000,GAS_SPEED=9'),'2v2 gas speed');
  assert(src.includes('t-(g.combatAt[id]||0)<3000'),'2v2 regeneration delay');
  assert(src.includes('chars[st.char].hp*.12*dt/1000'),'2v2 regeneration rate');
  assert(src.includes('s.overdriveUntil>t?57:105'),'2v2 gunner burst');
  assert(src.includes('g.stats[h.owner].ult+amount*.48'),'2v2 damage->ULT');
  assert(src.includes("g.stats[h.victim].char==='tank'?.44:.24"),'2v2 damage taken->ULT');
 }
 return {CHARS,BALANCE};
}
function run(a,b){
 const x=check(a,'1vs1'),y=check(b,'2vs2');
 for(const name of Object.keys(spec.common.characters)){
  for(const key of ['hp','speed','damage','range'])near(x.CHARS[name][key],y.CHARS[name][key],'cross-mode '+name+'.'+key);
  near(x.CHARS[name].reload*1000,y.CHARS[name].reload,'cross-mode '+name+'.reload',1);
 }
 for(const key of Object.keys(spec.common.balance))near(x.BALANCE[key],y.BALANCE[key],'cross-mode balance '+key);
}
const [a,b]=files.map(p=>fs.readFileSync(p,'utf8'));
run(a,b);
// Regression probes verify a one-sided change is detected.
const speedy=b.replace('speed:102,damage:BALANCE.tankNearDamage','speed:103,damage:BALANCE.tankNearDamage');
assert.notEqual(b,speedy);assert.throws(()=>run(a,speedy),/2vs2\.tank\.speed/);
const altered=a.replace('tankNearDamage:11','tankNearDamage:12');
assert.notEqual(a,altered);assert.throws(()=>run(altered,b),/1vs1\.tank\.damage|1vs1\.balance\.tankNearDamage/);
console.log('PASS: stable cross-mode rules — 4 characters, radius, stealth, weapon timings, regen, gas, ULT charge');
console.log('PASS: deliberately changing one mode only fails this test');
console.log('INFO: known differences are explicit exceptions, NOT proof of gameplay parity');
