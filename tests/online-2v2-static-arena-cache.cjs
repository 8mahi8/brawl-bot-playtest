// Exercise the exact arena painter embedded in the standalone 2vs2 HTML.
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'../online/ipad-squad-v2-lab.html'),'utf8');
const begin=html.indexOf('let arenaBackdrop=null,');
const end=html.indexOf('function drawPlayer(',begin);
assert(begin>0&&end>begin&&end-begin<5200,'extract live arena cache source');
const calls={created:0,fields:0,drawn:0,rects:0,gasStrokes:0};
const fakeCtx=new Proxy({},{get(obj,key){
 if(key in obj)return obj[key];
 if(key==='drawImage')return ()=>{calls.drawn++;};
 if(key==='fillRect')return ()=>{calls.rects++;};
 if(key==='strokeRect')return ()=>{calls.gasStrokes++;};
 return ()=>{};
},set(obj,key,value){obj[key]=value;return true;}});
let fallback=false;
const state={W:1680,H:960,ctx:fakeCtx,scene:'game',game:{mode:'ko'},WALLS:[{x:10,y:10,w:50,h:50}],
 BUSHES:[{x:50,y:100,w:200,h:90}],performance:{now:()=>100},
 BrawlStealthV1:{drawFields:()=>{calls.fields++;}},BALANCE:{areaRadius:100},
 gasMargin:()=>30,
 document:{createElement(tag){
  assert.equal(tag,'canvas');calls.created++;
  return {width:0,height:0,getContext:()=>fallback?null:fakeCtx};
 }}};
vm.createContext(state);
vm.runInContext(html.slice(begin,end)+'\nthis.renderArena=drawArena;this.metrics=()=>({builds:arenaBackdropRebuilds,frames:arenaBackdropFrames,disabled:arenaBackdropDisabled});',state);
for(let i=0;i<30;i++)state.renderArena();
assert.equal(calls.fields,1,'unchanged bush fog painted just once across 30 frames');
assert.equal(calls.created,1,'one backing canvas allocated');
assert.equal(calls.drawn,30,'one image blit per frame');
assert.equal(state.metrics().builds,1);
assert(calls.gasStrokes>=30,'live gas overlay still rerendered each frame');
const modeBushes=[{x:400,y:600,w:120,h:200}];
state.BUSHES=modeBushes;state.game={mode:'area',area:{contested:true}};
state.renderArena();
assert.equal(calls.fields,2,'area-mode bush background invalidates cache');
assert.equal(calls.created,2,'second map variant only builds once');
for(let i=0;i<10;i++)state.renderArena();
assert.equal(calls.fields,2,'area-mode backdrop reused');
assert.equal(state.metrics().frames,41);
const baseline=state.metrics().builds;
state.BUSHES=null; // Simulate a context that refuses memory allocation on older Safari.
fallback=true;
state.BUSHES=[];
state.renderArena();
assert.equal(state.metrics().disabled,true,'allocation fallback keeps gameplay rendering');
assert.equal(state.metrics().builds,baseline,'failed allocation must not publish a false cache');
assert.equal(calls.fields,3,'fallback paints in the live canvas');
state.renderArena();
assert.equal(calls.fields,4,'fallback remains playable and does not repeatedly allocate');
assert.equal(calls.created,3,'failed context allocation is not retried every frame');
console.log('PASS arena cache: 41 live frames use 2 bush paints; mode switch invalidates, gas stays dynamic, missing Safari context falls back');
