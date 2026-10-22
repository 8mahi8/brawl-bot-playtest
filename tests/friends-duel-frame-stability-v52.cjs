// V5.2: prove staged 1vs1 removes artificial remote walking snaps while
// keeping dash/jump correction and 2vs2/frozen Google Sites HTML untouched.
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {spec,makeAll,patchDuelFrameStabilityV52}=require('../scripts/build-friends-online.cjs');
const root=path.resolve(__dirname,'..');
const output=makeAll();
const sources={
 'normal.1vs1':fs.readFileSync(path.join(root,spec.modes['normal.1vs1'].source),'utf8'),
 'draft.1vs1':fs.readFileSync(path.join(root,spec.modes['draft.1vs1'].source),'utf8')
};
function slice(source,a,b){
 const i=source.indexOf(a),j=source.indexOf(b,i+a.length);
 assert(i>=0&&j>i,'missing real source block '+a);
 return source.slice(i,j);
}
function simulateRemoteSnippet(html,{dash=0,jumping=false}={}){
 const source=slice(html,'    const smoothing=1-Math.exp(-dt*18);','    let d=remote.targetAngle-remote.angle;');
 const remote={x:120,y:300,dash};
 const context={Math,remote,target:{x:350,y:300},dt:1/60,
   jumping:jumping?{actor:remote}:null};
 vm.runInNewContext(source,context,{timeout:800});
 return Math.hypot(remote.x-120,remote.y-300);
}
function verifyResize(html){
 const source=slice(html,'  function resize() {','  function drawNormalAimGuide(');
 let width=1688,height=780,writes=0,layoutCalls=0;
 const canvas={getBoundingClientRect(){return {width:844,height:390}}};
 Object.defineProperty(canvas,'width',{get(){return width},set(v){width=v;writes++}});
 Object.defineProperty(canvas,'height',{get(){return height},set(v){height=v;writes++}});
 const context={Math,window:{devicePixelRatio:2},canvas,W:1000,H:600,
  view:null,ctx:{setTransform(){}},applyButtonLayout(){layoutCalls++}};
 vm.createContext(context);
 vm.runInContext(source+'this.run=resize;',context,{timeout:800});
 context.run();
 assert.equal(writes,0,'unchanged physical dimensions must not reset Canvas bitmap');
 canvas.getBoundingClientRect=()=>({width:800,height:375});
 context.run();
 assert.equal(writes,2,'real resize must change both backing-store dimensions');
 context.run();
 assert.equal(writes,2,'repeat no-op resize still must not reset bitmap');
 assert.equal(layoutCalls,3,'control positions still updated');
}
for(const name of ['normal.1vs1','draft.1vs1']){
 const original=sources[name],html=output[name].html;
 const baseline=simulateRemoteSnippet(original);
 const reduced=simulateRemoteSnippet(html);
 assert(baseline>200,'old hard snap must be reproducible');
 assert(reduced>0&&reduced<75,'walking remote must interpolate rather than teleport');
 assert(simulateRemoteSnippet(html,{dash:.08})>200,'real dash still snaps');
 assert(simulateRemoteSnippet(html,{jumping:true})>200,'real jump still snaps');
 assert.equal(html.split('/* V5.2 1vs1 warp guard */').length-1,1);
 assert.equal(html.includes("const SEND_MS = 80"),true,'original 1vs1 position send cadence unchanged');
 verifyResize(html);
 assert.throws(()=>patchDuelFrameStabilityV52(html,name),/duplicate V5.2/);
 console.log('PASS V5.2 '+name+': walking '+baseline.toFixed(1)+'→'+reduced.toFixed(1)+' per simulation step; explicit dash/jump; no-op backing store');
}
for(const name of ['normal.2vs2','draft.2vs2']){
 assert(!output[name].html.includes('/* V5.2 1vs1 warp guard */'),
  'V5.2 must not change 2vs2 at all');
}
const frozen=fs.readFileSync(path.join(root,'sites/BRAWL_FRIENDS_1vs1.html'),'utf8');
assert(!frozen.includes('/* V5.2 1vs1 warp guard */'),
 'frozen Google Sites release cannot be silently patched');
console.log('PASS V5.2 2vs2 and frozen published 1vs1 untouched');
