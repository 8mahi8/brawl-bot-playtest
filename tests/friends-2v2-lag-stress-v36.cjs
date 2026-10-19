// V3.6 deterministic lag/load analysis: no Firebase, no browser mutation.
'use strict';
const assert=require('node:assert/strict');
function simulate({latencyMs=0,jitterMs=0,frameMs=16.67,shots=60,seed=7}={}){
 assert(Number.isFinite(latencyMs)&&latencyMs>=0&&latencyMs<=2000);
 assert(Number.isFinite(jitterMs)&&jitterMs>=0&&jitterMs<=1000);
 assert(Number.isFinite(frameMs)&&frameMs>0&&frameMs<=1000);
 assert(Number.isInteger(shots)&&shots>0&&shots<=10000);
 let rng=seed>>>0;
 function rand(){rng=(Math.imul(rng,1664525)+1013904223)>>>0;return rng/4294967296;}
 const observations=[];
 for(let i=0;i<shots;i++){
  const fired=i*250;
  const arrival=fired+Math.max(0,latencyMs+(rand()*2-1)*jitterMs);
  const nextFrame=Math.ceil((arrival+1e-7)/frameMs)*frameMs;
  observations.push({shot:i,networkArrivalMs:+(arrival-fired).toFixed(3),
   nextFrameWaitMs:+(nextFrame-arrival).toFixed(3),
   visibleAfterMs:+(nextFrame-fired).toFixed(3)});
 }
 const values=observations.map(o=>o.visibleAfterMs).sort((a,b)=>a-b);
 const percentile=p=>values[Math.min(values.length-1,Math.ceil(values.length*p)-1)];
 return {settings:{latencyMs,jitterMs,frameMs,shots,seed},
  observed:{p50Ms:percentile(.5),p95Ms:percentile(.95),maxMs:values.at(-1),
   averageMs:+(values.reduce((a,b)=>a+b,0)/values.length).toFixed(3)},
  notes:['Synthetic network-arrival-to-next-frame model; not a live Firebase or iPad measurement.',
   'Host-authoritative game state and real visual prediction are not simulated.'],
  observations};
}
function run(){
 const cases=[
  {name:'ideal-60fps',latencyMs:0,jitterMs:0,frameMs:16.67},
  {name:'wifi-60fps',latencyMs:80,jitterMs:40,frameMs:16.67},
  {name:'wifi-30fps',latencyMs:80,jitterMs:40,frameMs:33.33},
  {name:'congested-20fps',latencyMs:160,jitterMs:90,frameMs:50}
 ];
 const results=cases.map(c=>({name:c.name,...simulate(c)}));
 for(const r of results){
  assert(r.observed.p95Ms>=r.observed.p50Ms,'percentiles ordered');
  assert.deepEqual(simulate(r.settings),simulate(r.settings),'same seed must be reproducible');
 }
 assert(results[3].observed.p95Ms>results[0].observed.p95Ms,
  'congested injection must produce worse synthetic responsiveness than ideal');
 for(const bad of [{latencyMs:-1},{jitterMs:Infinity},{frameMs:0},{shots:0},{shots:10001}])
  assert.throws(()=>simulate(bad),'reject invalid scenario inputs');

 const report={version:'V3.6',
  source:'synthetic deterministic test, not device telemetry',
  scenarios:results.map(({name,settings,observed,notes})=>({name,settings,observed,notes}))};
 process.stdout.write(JSON.stringify(report,null,2)+'\n');
}
if(require.main===module)run();
module.exports={simulate};
