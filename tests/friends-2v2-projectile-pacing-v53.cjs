'use strict';
// V5.3 staging-only A/B playback of the REAL 2vs2 projectile Canvas functions.
// No Firebase traffic, production HTML writes, or gameplay/HP simulation.
const fs=require('node:fs'),assert=require('node:assert/strict'),vm=require('node:vm');
const {makeAll,spec}=require('../scripts/build-friends-online.cjs');
const generated=makeAll();
const modes=['normal.2vs2','draft.2vs2'];
const source='function squadRemoteProjectileVisual(';
const end='function updateCameraLabel()';
function approximate(actual,expected,label){
 assert(Math.abs(actual-expected)<.02,label+': '+actual+' vs '+expected);
}
function replay(html,ageMs){
 const start=html.indexOf(source),stop=html.indexOf(end,start);
 assert(start>=0&&stop>start,'missing projectile renderer');
 assert.equal(html.indexOf(source,start+source.length),-1,'duplicate projectile renderer');
 const snippet=html.slice(start,stop);
 const time=1000+ageMs;
 const projectile={id:'remoteShot:0',fireId:'remoteShot',owner:'peer',
   x:100,y:130,vx:660,vy:0,dist:400,spawnAt:1000,team:'red',char:'sniper'};
 const bulletVisuals=new Map(),ctx={
  beginPath(){},arc(){},stroke(){},save(){},restore(){},moveTo(){},lineTo(){}
 };
 const env={Math,Object,Number,Set,Map,performance:{now:()=>time},
  clamp:(x,a,b)=>Math.max(a,Math.min(b,x)),serverNow:()=>time,
  game:{clock:{t:1000,wallAt:1000},projectiles:{'remoteShot:0':projectile},
   gad2FakeShots:{}},myId:'local',ctx,clientBullets:[],bulletVisuals,
  remoteMuzzleVolleys:new Set(),boundedRemember:(s,k)=>s.add(k),
  previewVisibleBulletCollision:()=>{},
  visualCombatNow:()=>time};
 vm.createContext(env);
 vm.runInContext(snippet,env,{timeout:1000});
 env.drawSmoothProjectiles(1/60);
 const point=bulletVisuals.get('remoteShot:0');
 assert(point&&Number.isFinite(point.x),'remote shot must be drawn');
 return point.x;
}
for(const name of modes){
 const original=fs.readFileSync(spec.modes[name].source,'utf8');
 const candidate=generated[name].html;
 assert.equal((candidate.match(/function squadProjectileVisualAheadSeconds\\(/g)||[]).length,1,
  'one staging visual policy '+name);
 assert(!original.includes('function squadProjectileVisualAheadSeconds('),
  'fixed source HTML must remain unchanged');
 const ages=[0,80,110,150,180,220];
 const baseline=ages.map(age=>replay(original,age));
 const next=ages.map(age=>replay(candidate,age));
 for(let i=0;i<3;i++)approximate(next[i],baseline[i],name+' normal-age parity');
 approximate(baseline[3],baseline[2],name+' old 110ms plateau');
 approximate(next[3]-next[2],660*.04,name+' maintained 110–150ms motion');
 approximate(next[4]-next[3],660*.03,name+' maintained 150–180ms motion');
 approximate(next[5],next[4],name+' new 180ms safety cap');
 assert(next[4]>baseline[4]+40,'visual motion must improve under 180ms stale snapshot');
 for(const x of [original,candidate])assert(x.includes('function drawSmoothProjectiles(dt)'),
  'same actual Canvas renderer');
 console.log('PASS V5.3 '+name+' simulated stale snapshot Canvas positions '+
  JSON.stringify({snapshotAgeMs:ages,baselineX:baseline.map(x=>Math.round(x*10)/10),
    stagingX:next.map(x=>Math.round(x*10)/10)}));
}
for(const name of ['normal.1vs1','draft.1vs1']){
 assert(!generated[name].html.includes('squadProjectileVisualAheadSeconds'),
  'staging experiment must never affect '+name);
}
console.log('PASS V5.3 staging-only visual policy; 1vs1, fixed source and authoritative combat unchanged');
