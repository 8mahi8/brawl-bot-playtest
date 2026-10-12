// Open Arena LAB world/cover/route/symmetry QA. No browser is required.
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {buildOpenArena,OPEN_ARENA:c}=require('../scripts/build-open-arena-lab.cjs');
const current=fs.readFileSync('foundation/2v2-open-arena-lab.html','utf8');
const baseline=fs.readFileSync('foundation/2v2-foundation-v1.html','utf8');
assert.equal(current,buildOpenArena(baseline),'regenerate candidate from baseline exactly');
const source=current.match(/<script>([\s\S]*?)<\/script>/)?.[1];
assert(source&&source.length>100000,'standalone app is present');
new vm.Script(source,{filename:'2v2-open-arena-lab'});
const lines=source.split('\n');
const get=k=>{
 const line=lines.find(s=>s.startsWith('const '+k+'='));
 assert(line,'missing map '+k);
 return vm.runInNewContext(line.slice(('const '+k+'=').length).replace(/;$/, ''),{Math});
};
const wallSets=[get('KO_WALLS'),get('AREA_WALLS')],bushSets=[get('KO_BUSHES'),get('AREA_BUSHES')],spawn=get('SPAWNS');
function touch(p,w,r=22){const x=Math.max(w.x,Math.min(p.x,w.x+w.w)),y=Math.max(w.y,Math.min(p.y,w.y+w.h));return Math.hypot(x-p.x,y-p.y)<r;}
function valid(p,walls){return p.x>22&&p.y>22&&p.x<c.width-22&&p.y<c.height-22&&!walls.some(w=>touch(p,w));}
assert(c.width>1536&&c.height>860,'both world dimensions grow');
assert.equal((source.match(/W=1920,H=1120/g)||[]).length,3,'BOT, host and client agree on world');
assert(source.includes('sw/1330,sh/790'),'expanded follow camera');
assert(source.includes('const m=clamp((t-28000)/1000*12,0,505)'),'host gas agrees with larger world');
assert(source.includes('GAS_SPEED=12,GAS_CAP=505'),'client gas agrees with host');
const center={x:c.width/2,y:c.height/2};
for(let mode=0;mode<2;mode++){
 const walls=wallSets[mode],bushes=bushSets[mode];
 assert(walls.length>=8&&bushes.length>=8,'both modes have meaningful terrain');
 assert(valid(center,walls),'central arena remains accessible for '+mode);
 for(const w of [...walls,...bushes])assert(w.x>=0&&w.y>=0&&w.x+w.w<=c.width&&w.y+w.h<=c.height,'cover inside map');
 for(const w of walls){const mirror=walls.find(z=>z.x===c.width-w.x-w.w&&z.y===w.y&&z.w===w.w&&z.h===w.h);
  assert(mirror,'fair bilateral wall layout: '+JSON.stringify(w));
 }
 for(const p of Object.values(spawn))assert(valid(p,walls),'spawn is clear in '+mode+': '+JSON.stringify(p));
 // Bounded eight-way path in a 40px occupancy grid; verifies flanks/center are not isolated.
 const step=40,route=(start,finish)=>{
  const sx=Math.round(start.x/step),sy=Math.round(start.y/step),ex=Math.round(finish.x/step),ey=Math.round(finish.y/step);
  const queue=[[sx,sy,0]],visited=new Set(),within=(x,y)=>valid({x:x*step,y:y*step},walls);
  for(let i=0;i<queue.length;i++){const [x,y,n]=queue[i],key=x+','+y;if(visited.has(key)||!within(x,y))continue;visited.add(key);
   if(Math.hypot((x-ex)*step,(y-ey)*step)<=step*1.5)return n*step;
   for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){
    const nx=x+dx,ny=y+dy;if(nx>=0&&ny>=0&&nx*step<c.width&&ny*step<c.height)queue.push([nx,ny,n+1]);
   }
  }return Infinity;
 };
 for(const p of Object.values(spawn)){const length=route(p,center);assert(Number.isFinite(length)&&length<1550,'reachable arena center '+mode+' '+JSON.stringify(p)+' dist='+length);}
}
assert.equal(spawn.red1.x-spawn.blue1.x,960,'forward spawns preserve quick opening');
console.log('PASS enlarged symmetric worlds, clear spawns, reachable objectives and camera/gas consistency');
