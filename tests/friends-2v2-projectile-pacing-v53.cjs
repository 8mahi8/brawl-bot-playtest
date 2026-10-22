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
function replay(html,ageMs,owner='peer',options={}){
 const start=html.indexOf(source),stop=html.indexOf(end,start);
 assert(start>=0&&stop>start,'missing projectile renderer');
 assert.equal(html.indexOf(source,start+source.length),-1,'duplicate projectile renderer');
 const snippet=html.slice(start,stop);
 const time=1000+ageMs;
 const projectile={id:'remoteShot:0',fireId:'remoteShot',owner,
   x:100,y:130,vx:660,vy:0,dist:400,spawnAt:1000,team:'red',char:'sniper',
   ...(options.bullet||{})};
 const bulletVisuals=new Map(),ctx={
  beginPath(){},arc(){},stroke(){},save(){},restore(){},moveTo(){},lineTo(){}
 };
 const env={Math,Object,Number,Set,Map,
  W:options.width||1920,H:options.height||1120,
  WALLS:options.walls||[],combatNow:()=>time,
  window:{__brawlLagV39QA:{tap(){}}},performance:{now:()=>time},
  clamp:(x,a,b)=>Math.max(a,Math.min(b,x)),serverNow:()=>time,
  game:{clock:{t:1000,wallAt:1000},projectiles:{'remoteShot:0':projectile},
   gad2FakeShots:{},gad2Walls:options.portableWalls||{}},
  myId:'local',ctx,clientBullets:[],bulletVisuals,
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
 assert.equal(candidate.split('function squadProjectileVisualAheadSeconds(').length-1,1,
  'one staging visual policy '+name);
 assert(!original.includes('function squadProjectileVisualAheadSeconds('),
  'fixed source HTML must remain unchanged');
 const ages=[0,80,110,150,180,220];
 const baseline=ages.map(age=>replay(original,age));
 const next=ages.map(age=>replay(candidate,age));
 for(let i=0;i<3;i++)approximate(next[i],baseline[i],name+' normal-age parity');
 // V5.3 must never speed up the local owner's authoritative projectiles.
 const baselineOwn=ages.map(age=>replay(original,age,'local'));
 const stagingOwn=ages.map(age=>replay(candidate,age,'local'));
 for(let i=0;i<ages.length;i++)
  approximate(stagingOwn[i],baselineOwn[i],name+' own-shot '+ages[i]+'ms parity');
 approximate(baseline[3],baseline[2],name+' old 110ms plateau');
 approximate(next[3]-next[2],660*.04,name+' maintained 110–150ms motion');
 approximate(next[4]-next[3],660*.03,name+' maintained 150–180ms motion');
 approximate(next[5],next[4],name+' new 180ms safety cap');
 assert(next[4]>baseline[4]+40,'visual motion must improve under 180ms stale snapshot');

 // Count Canvas frame pairs that have stopped advancing during an artificially
 // delayed authoritative snapshot. This is a visual-only replay, not network RTT.
 const frameAges=Array.from({length:15},(_,i)=>i*16);
 const baselineFrames=frameAges.map(age=>replay(original,age));
 const stagedFrames=frameAges.map(age=>replay(candidate,age));
 const stopFrames=xs=>xs.slice(1).reduce((count,x,i)=>
  count+(Math.abs(x-xs[i])<.02?1:0),0);
 const baselineStops=stopFrames(baselineFrames);
 const stagedStops=stopFrames(stagedFrames);
 assert(baselineStops>=7, name+' baseline must demonstrate a multi-frame freeze');
 assert(stagedStops<=4, name+' guarded pacing must have fewer stopped frames');
 assert(stagedStops<baselineStops, name+' staged replay must improve frame continuity');
 const boundedWall={walls:[{x:190,y:115,w:30,h:50}]};
 const guardedWallFrames=frameAges.map(age=>replay(candidate,age,'peer',boundedWall));
 const unmodifiedWallFrames=frameAges.map(age=>replay(original,age,'peer',boundedWall));
 for(let i=0;i<frameAges.length;i++)
  approximate(guardedWallFrames[i],unmodifiedWallFrames[i],
   name+' preflight collision must retain old trajectory '+frameAges[i]+'ms');
 console.log('V5.3 '+name+' paused-snapshot visual frame test '+JSON.stringify({
  sampleStepMs:16,snapshotUnchangedMs:224,baselineStoppedFrames:baselineStops,
  stagingStoppedFrames:stagedStops,wallGuardStoppedFrames:stopFrames(guardedWallFrames)}));

 // Static KO wall: the requested extra flight would cross solid geometry.
 const wall=[{x:190,y:115,w:30,h:50}];
 approximate(replay(candidate,180,'peer',{walls:wall}),baseline[4],
  name+' static wall blocks extra-only segment');
 for(const age of [115,120,135,150,170,180])
  approximate(replay(candidate,age,'peer',{walls:wall}),replay(original,age,'peer',{walls:wall}),
   name+' wall lookahead must not cause late bullet rewind at '+age+'ms');
 // A wall that is not on the bullet path must not freeze extra motion.
 approximate(replay(candidate,180,'peer',{walls:[{x:190,y:250,w:30,h:50}]}),
  next[4],name+' distant wall does not block');
 // Draft GAD2 portable wall obeys its active time window.
 const portable={wall:{kind:'portable_wall',x:190,y:115,w:30,h:50,
  start:0,until:3000}};
 approximate(replay(candidate,180,'peer',{portableWalls:portable}),baseline[4],
  name+' active portable wall blocks extra-only segment');
 portable.wall.until=1;
 approximate(replay(candidate,180,'peer',{portableWalls:portable}),next[4],
  name+' expired portable wall does not block');
 // If the extra segment would cross the arena boundary, retain old cap.
 const edge={bullet:{x:1780,vx:1000,range:2000,dist:50}};
 approximate(replay(candidate,180,'peer',edge),replay(original,180,'peer',edge),
  name+' arena edge stops extended path');
 // Never visually extend past known shot range.
 const short={bullet:{range:490}};
 approximate(replay(candidate,180,'peer',short),baseline[4],
  name+' shot range prevents additional ghost');
 // Spawn time is accounted for before checking extra travel vs walls.
 const delayed={bullet:{spawnAt:1050}};
 assert(replay(candidate,180,'peer',delayed)>replay(original,180,'peer',delayed)+35,
  name+' delayed spawn still advances safely when free');
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
