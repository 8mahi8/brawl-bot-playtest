// Both game modes use identical EXECUTABLE core ammo and volley code.
'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const scripts=['1v1','2v2'].map(mode=>fs.readFileSync('foundation/'+mode+'-foundation-v1.html','utf8').match(/<script>([\s\S]*?)<\/script>/)?.[1]);
assert(scripts.every(Boolean),'generated scripts present');
const extract=(s,a,b)=>{const i=s.indexOf(a),j=s.indexOf(b,i);assert(i>=0&&j>i,'missing '+a);return s.slice(i,j)};
const actions=scripts.map(s=>extract(s,'/* BEGIN SHARED RUNTIME COMBAT_ACTIONS */','/* END SHARED RUNTIME COMBAT_ACTIONS */'));
const weapons=scripts.map(s=>extract(s,'/* BEGIN SHARED WEAPON RULES */','/* END SHARED WEAPON RULES */'));
assert.equal(actions[0],actions[1],'actual embedded refill/volley code differs');
assert.equal(weapons[0],weapons[1],'actual embedded weapon rules differ');
const characters={tank:{hp:180,range:160,reload:2500/3,damage:11},gunner:{hp:100,range:280,reload:1250,damage:10},sniper:{hp:70,range:455,reload:5500/3,damage:36},bomber:{hp:90,range:300,reload:1500,damage:28}};
const contexts=actions.map((s,i)=>{
 const context={};
 const globals='const chars='+JSON.stringify(characters)+';const seatOf=()=> "blue1",team=()=> "blue";this.refill=ammo;this.volley=burst;';
 vm.runInNewContext(weapons[i]+'\n'+s+'\n'+globals,context);
 return context;
});
function check(label,fn){for(const ctx of contexts)fn(ctx);console.log('PASS '+label);}
check('Normal gunner ammo refill respects 1.25s reload',ctx=>{
 const before={char:'gunner',ammo:1,refillAt:500,overdriveUntil:0};
 assert.equal(ctx.refill(before,1000).ammo,1);
 const next=ctx.refill(before,1750);assert.equal(next.ammo,2);assert.equal(next.refillAt,1750);
 assert.equal(before.ammo,1,'refill must not mutate its argument');
});
check('Overdrive refills at 750ms and caps at 3 charges',ctx=>{
 const s={char:'gunner',ammo:0,refillAt:500,overdriveUntil:5000};
 assert.equal(ctx.refill(s,1250).ammo,2);
 assert.equal(ctx.refill(s,2800).ammo,3);
 assert.equal(ctx.refill({char:'gunner',ammo:3,refillAt:500,overdriveUntil:5000},4000).refillAt,0);
});
check('Tank volley returns five distinct angles from the same muzzle',ctx=>{
 const a={owner:'p',eventId:'tankShot',x:250,y:300,angle:0},s={char:'tank',life:0};
 const bullets=ctx.volley(a,s,{});assert.equal(bullets.length,5);
 bullets.forEach((b,i)=>{
  assert.equal(b.x,278);assert.equal(b.y,300);assert.equal(b.team,'blue');assert.equal(b.char,'tank');
  assert(Math.abs(Math.atan2(b.vy,b.vx)-[-.2,-.1,0,.1,.2][i])<1e-9);
 });
});
check('Gunner volley has exactly three uniquely identified bullets',ctx=>{
 const bullets=ctx.volley({owner:'p',eventId:'gunnerShot',x:250,y:300,angle:0},{char:'gunner',life:0},{});
 assert.equal(bullets.length,3);assert.equal(new Set(bullets.map(b=>b.id)).size,3);
 bullets.forEach((b,i)=>{
  assert.equal(b.x,278);assert.equal(b.damage,10);assert.equal(b.range,280);
  assert(Math.abs(Math.atan2(b.vy,b.vx)-[-.075,0,.075][i])<1e-9);
 });
});
for(const s of scripts){
 assert.equal((s.match(/function ammo\(s,t\)/g)||[]).length,1,'one ammo method');
 assert.equal((s.match(/function burst\(a,s,g\)/g)||[]).length,1,'one volley method');
}
console.log('PASS single-source ammo and volley embedded precisely once per game');
