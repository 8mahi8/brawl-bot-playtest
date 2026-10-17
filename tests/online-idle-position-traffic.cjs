// Test the exact 2vs2 stationary packet gate (the code used by the full HTML).
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'../online/ipad-squad-v2-lab.html'),'utf8');
const begin=html.indexOf('const POSITION_ACTIVE_INTERVAL_MS=');
const end=html.indexOf('function update(dt,movementDt=dt)',begin);
assert(begin>0&&end>begin&&end-begin<2300,'extract live position throttler');
const c={Math};vm.createContext(c);
vm.runInContext(html.slice(begin,end)+'\nthis.due=positionPublishDue;',c);
const p={x:480,y:700,a:0,vx:0,vy:0,connectionId:'conn1',matchId:'m1',round:1,motionRev:0,life:0};
const due=(a,b,ms)=>c.due(a,b,ms);
assert.equal(due(null,p,0),true,'first packet fires without waiting');
assert.equal(due(p,p,90),false,'standing still skips standard 80ms resend');
assert.equal(due(p,p,499),false,'idle silence is intentional until heartbeat');
assert.equal(due(p,p,500),true,'heartbeat eventually refreshes stationary state');
assert.equal(due(p,{...p,x:481,vx:102},80),true,'movement retains 80ms update');
assert.equal(due({...p,vx:100},p,80),true,'stopping immediately sends zero velocity');
assert.equal(due(p,{...p,a:.08},80),true,'facing change remains responsive while standing');
assert.equal(due(p,{...p,a:.08},79),false,'min moving interval remains 80ms');
assert.equal(due({...p,a:Math.PI-.01},{...p,a:-Math.PI+.01},90),false,'angle wrap does not cause false turn');
for(const property of ['connectionId','matchId','round','motionRev','life']){
 assert.equal(due(p,{...p,[property]:typeof p[property]==='string'?'new':p[property]+1},0),true,'scope change sends instantly: '+property);
}
function writesOver(ms,velocity=0){
 let previous=null,last=0,writes=0;
 for(let t=0;t<=ms;t+=20){
  const pose={...p,x:480+velocity*t/1000,vx:velocity};
  if(due(previous,pose,t-last)){previous=pose;last=t;writes++;}
 }
 return writes;
}
const idle=writesOver(5000),moving=writesOver(5000,102);
assert(idle>=9&&idle<=11,'5s idle positions should use heartbeat: '+idle);
assert(moving>=50&&moving<=64,'5s movement must keep low latency: '+moving);
assert(moving>=idle*5,'stationary position stream is materially reduced');
console.log('PASS 2vs2 position traffic: idle '+idle+' vs moving '+moving+' packets/5s; 80ms movement, 500ms idle, scope and facing immediate');
