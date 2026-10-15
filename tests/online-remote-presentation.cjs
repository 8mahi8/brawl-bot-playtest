// BRAWL 2vs2 visual-only remote interpolation regression suite.
// The test extracts the exact helper embedded in the FULL HTML that Google Sites runs.
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const file=path.join(__dirname,'..','online','ipad-squad-v2-lab.html');
const html=fs.readFileSync(file,'utf8');
const match=html.match(/function remotePresentationTarget\([\s\S]*?\n }/);
assert(match,'remote presentation helper must exist');
assert(html.includes('remotePositionReceivedAt.set(id,performance.now())'),'must time real received position updates');
assert(html.includes('remotePositionReceivedAt.clear()'),'must reset stale timestamps');
assert(html.includes('const target=fresh?remotePresentationTarget('),'preview helper must only run on valid fresh position packets');
assert.equal((html.match(/remotePresentationTarget\(/g)||[]).length,2,'preview helper is not part of hit/game physics');
const run=new vm.Script(match[0]+'\nremotePresentationTarget').runInNewContext({
  Number,Math,REMOTE_VISUAL_EXTRAPOLATE_MS:90,R:20,W:1000,H:600,
  clamp:(v,min,max)=>Math.max(min,Math.min(max,v))
});
const wall=[{x:110,y:60,w:40,h:90}];
const pos=(x,y,vx,vy)=>({x,y,vx,vy,a:0});
let passed=0;
function pass(name,fn){fn();passed++;console.log('PASS remote presentation: '+name);}
pass('90ms cap on stale updates',()=>{
  const a=run(pos(300,250,100,0),500,1500,[]);
  assert.equal(a.x,309);
});
pass('30ms prediction at 100 units per second',()=>{
  const a=run(pos(300,250,100,-100),500,530,[]);
  assert.equal(a.x,303);assert.equal(a.y,247);
});
pass('no prediction before receiving packet',()=>{
  const p=pos(300,250,100,100);
  assert.equal(run(p,600,500,[]),p);
});
pass('map boundaries clamped',()=>{
  const a=run(pos(975,575,400,400),10,110,[]);
  assert.equal(a.x,980);assert.equal(a.y,580);
});
pass('velocity spike capped',()=>{
  const a=run(pos(300,250,10000,0),10,110,[]);
  assert.equal(a.x,323.4);
});
pass('solid walls block predictions',()=>{
  const a=run(pos(90,100,100,0),10,110,wall);
  assert.equal(a.x,90);assert.equal(a.y,100);
});
pass('stationary opponent stays in place',()=>{
  const a=run(pos(300,250,0,0),10,200,[]);
  assert.equal(a.x,300);assert.equal(a.y,250);
});
pass('bad velocity disables prediction',()=>{
  const p=pos(300,250,NaN,0);
  assert.equal(run(p,10,90,[]),p);
});
pass('pure function does not mutate authoritative position packet',()=>{
  const p=pos(300,250,100,0);const original=JSON.stringify(p);
  const a=run(p,10,90,[]);assert.notEqual(a,p);assert.equal(JSON.stringify(p),original);
});
const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(m=>m[1]).filter(s=>s.trim());
for(const [i,s] of scripts.entries())new vm.Script(s,{filename:file+'#'+i});
console.log('PASS '+passed+' position prediction regression cases and '+scripts.length+' embedded scripts syntax checks');
