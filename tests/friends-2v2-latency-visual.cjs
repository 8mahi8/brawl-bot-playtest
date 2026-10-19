// School iPad finding: peers can move smoothly while host-committed projectiles
// materialize late. Regression gate for immediate ACTION-driven, VISUAL-ONLY
// shot and bomber previews in BOTH 2v2 modes. No Firebase/network writes here.
'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const names=[
 'sites/BRAWL_FRIENDS_2vs2_LATENCY_CANDIDATE.html',
 'sites/BRAWL_DRAFT_FRIENDS_BETA_2vs2_LATENCY_CANDIDATE.html'
];
const files=names.map(f=>fs.readFileSync(path.join(root,f),'utf8'));
function block(s,a,b){const start=s.indexOf(a),end=s.indexOf(b,start+a.length);assert(start>=0&&end>start,'missing '+a);return s.slice(start,end);}
for(let i=0;i<2;i++){
 const html=files[i];
 for(const [j,tag]of [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].entries())
   if(tag[1].trim())new vm.Script(tag[1],{filename:names[i]+':script'+j});
 assert(html.includes('observeShotAction(a,localPrediction)'),names[i]+' ACTION event bound to preview');
 assert(html.includes('renderEarlyShots(performance.now())'),names[i]+' preview drawn each rendered game frame');
 assert(html.includes('earlyShots.clear();earlyBombSmoothing.clear();'),names[i]+' stale animation cleared on restart/pause');
 assert(html.includes("receipt?.status==='rejected'"),names[i]+' denied action has no continuing fake shot');
 assert(html.includes("receipt?.status==='accepted'")&&html.includes("game.clock?.wallAt||0")&&html.includes("if(!stillActive){earlyShots.delete(id);continue;}"),
  names[i]+' host-committed and already-impacted bullets cannot linger as local ghost visuals');
 assert(html.includes('earlyBombSmoothing.keys()')&&html.includes('earlyBombSmoothing.delete(key)'),
  names[i]+' impact-cleared bombs cannot leak visual handoff state');

 assert(html.includes('bomberSmoothPoint(u,f,dt)'),names[i]+' bomb smoothly hands off to host');
 assert(html.includes('window.__brawlEarlyShotsQA'),names[i]+' read-only in-browser telemetry');
}
const functions=files.map(s=>block(s,'function earlyProjectilePoints(','function observeShotAction('));
assert.equal(functions[0],functions[1],'shot + bomber predictive geometry must be identical in normal/draft 2v2');
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const ctx={CHARS:{tank:{range:580},gunner:{range:500},sniper:{range:455}},BALANCE:{bomberRange:300,bomberFlightMs:800},game:{},clamp,
 engine:()=>({landing:(src,angle,reach)=>({x:src.x+Math.cos(angle)*reach,y:src.y+Math.sin(angle)*reach})}),Math};
const run=vm.runInNewContext(functions[0]+'\n({earlyProjectilePoints,earlyBomberPoint})',ctx);
const action={eventId:'e1',x:250,y:400,angle:0,reach:300};
for(const ms of [0,100,180,300,600]){
 const shots=run.earlyProjectilePoints(action,'tank',ms);
 assert.equal(shots.length,5);
 assert(shots.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)));
 assert(shots.every(p=>p.x>=278));
}
const gun=run.earlyProjectilePoints(action,'gunner',70);
assert.equal(gun.filter(p=>p.ready).length,1,'only gunner first projectile starts before burst intervals');
const bomb0=run.earlyBomberPoint(action,0);
const bomb400=run.earlyBomberPoint(action,400);
const bomb800=run.earlyBomberPoint(action,800);
assert.equal(bomb0.x,250);assert.equal(bomb800.x,550);
assert(bomb400.y<400&&bomb400.x>250&&bomb400.x<550,'bomber flight arcs between shooter and landing');
console.log('PASS both 2v2 candidate scripts parse, share identical early shot/bomber geometry; simulated 0-600ms frame age; rejected action and round reset guarded');
