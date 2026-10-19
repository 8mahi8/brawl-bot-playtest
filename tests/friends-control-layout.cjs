// Four-mode geometry regression. Before/after math MUST match existing
// pixel positions; no player saved control positions should unexpectedly move.
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),layoutSource=fs.readFileSync(path.join(root,'shared/runtime/friends-control-layout.inc.js'),'utf8');
const layout=vm.runInNewContext(layoutSource+'\nBrawlControlLayoutV1');
const {makeAll}=require('../scripts/build-friends-online.cjs');
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
for(const profile of ['duel','squad']){
 for(const [w,h]of [[1024,650],[768,340],[320,180],[1365,720],[370,700],[1920,1120]]){
  for(const s of [44,66,68,70,88,100]){
   const p={x:.77,y:.67,size:s};
   const expected=profile==='duel'?Math.min(s,Math.max(40,h*.36),Math.max(40,w*.42)):
    Math.min(s,Math.max(30,Math.min(w,h)*.30));
   assert.equal(layout.displaySize(p,w,h,profile),expected,profile+' exact physical size');
   const pt=layout.center(p,w,h,expected);
   assert.equal(pt.x,clamp(p.x*w,expected/2+4,w-expected/2-4));
   assert.equal(pt.y,clamp(p.y*h,expected/2+4,h-expected/2-4));
   for(const [dx,dy]of [[0,0],[w/2,h/2],[w,h],[w*1.9,-70]]){
    const rect={left:100,top:50,width:w,height:h};
    const ev={clientX:100+dx,clientY:50+dy};
    const d=layout.dragPoint(ev,rect,profile==='squad'?s:expected);
    const px=(profile==='squad'?s:expected)/2+4;
    assert.equal(d.x,clamp(dx/w,px/w,1-px/w));
    assert.equal(d.y,clamp(dy/h,px/h,1-px/h));
   }
  }
 }
}
const defaults={x:.77,y:.67,size:68};
for(const p of [
 {x:.81,y:.36,size:80},{x:-4,y:9,size:300},
 {x:0,y:0,size:0},{x:NaN,y:.7,size:70},
 {x:undefined,y:.5,size:44}
]){
 const duel=layout.restorePoint(p,defaults,'duel');
 if([p.x,p.y,p.size].every(Number.isFinite)){
  assert.equal(duel.x,clamp(p.x,0,1));assert.equal(duel.y,clamp(p.y,0,1));
  assert.equal(duel.size,clamp(p.size,44,100));
 }else assert.deepEqual({...duel},defaults);
 const squad=layout.restorePoint(p,defaults,'squad');
 assert.equal(squad.x,clamp(Number(p.x)||defaults.x,.07,.93));
 assert.equal(squad.y,clamp(Number(p.y)||defaults.y,.12,.91));
 assert.equal(squad.size,clamp(Number(p.size)||defaults.size,44,100));
 const gad2=layout.restorePoint(p,defaults,'squad-gad2');
 if([p.x,p.y,p.size].every(Number.isFinite)){
  assert.equal(gad2.x,clamp(p.x,.07,.93));
  assert.equal(gad2.y,clamp(p.y,.12,.91));
  assert.equal(gad2.size,clamp(p.size,44,100));
 }else assert.deepEqual({...gad2},defaults);
}
const outputs=makeAll();
for(const [name,{html,mode}]of Object.entries(outputs)){
 assert(html.includes('BrawlControlLayoutV1.dragPoint('),'real drag gesture uses shared geometry '+name);
 assert(html.includes('BrawlControlLayoutV1.restorePoint('),'old saved layout is restored using shared code '+name);
 assert(html.includes('BrawlControlLayoutV1.center('),'rendered UI placement uses shared geometry '+name);
 assert(html.includes('BrawlControlLayoutV1.displaySize('),'rendered UI size uses shared geometry '+name);
 const input=fs.readFileSync(path.join(root,mode.source),'utf8');
 assert(!input.includes('BrawlControlLayoutV1'),'actual Google Sites candidates left unchanged '+name);
 if(name==='draft.2vs2'){
  assert(html.includes("BrawlControlLayoutV1.restorePoint(saved,layoutDefault.gad2,'squad-gad2')"),'GAD2 separate namespace/back-compat');
  assert(html.includes("const DRAFT_GAD2_LAYOUT_KEY='brawl-draft-2v2-gad2-layout-v1';"),'GAD2 storage key stable');
 }
}
console.log('PASS shared controls UI: 4 modes call same geometry/persistence module; 600+ geometry cases pixel-exact; GAD2 and existing saved positions preserved');
