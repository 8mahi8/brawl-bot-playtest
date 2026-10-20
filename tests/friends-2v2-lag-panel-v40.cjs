'use strict';
// Static + touch UI regression: do not require the user to open DevTools.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {makeAll,spec,patchSquadLagPanelV40}=require('../scripts/build-friends-online.cjs');
const src=fs.readFileSync(spec.modules.squadLagPanelV40,'utf8');
assert(!/firebase\s*\.\s*database|room\.child|db\.ref|fetch\s*\(|XMLHttpRequest|localStorage|sessionStorage|setInterval/.test(src),
 'UI must not send data, read game rooms, store data or start background timers');
assert(!src.includes('</script>'),'must remain within inline script');
assert(src.includes('top:auto;bottom:max(3px,env(safe-area-inset-bottom));left:50%'),
 'touch diagnosis control stays at bottom center, never across round score HUD');
const staged=makeAll(),baseline=makeAll(null,null,null,null,null,false);
const marker='window.__brawlLagV40UI=Object.freeze(';
for(const name of ['normal.2vs2','draft.2vs2']){
 const html=staged[name].html;
 assert.equal(html.split(marker).length-1,1,'one staging-only panel '+name);
 assert(html.includes(src.trimEnd()),'single shared panel source in '+name);
 assert(!baseline[name].html.includes(marker),'baseline has no instrumentation '+name);
 assert(!fs.readFileSync(spec.modes[name].source,'utf8').includes(marker),
  'no edits to frozen candidate '+name);
 assert.throws(()=>patchSquadLagPanelV40(html,src,name),/cannot be inserted twice/);
}
for(const name of ['normal.1vs1','draft.1vs1'])
 assert(!staged[name].html.includes(marker),'no 2v2 overlay in '+name);
const ids=new Map(),elements=[];
function makeNode(tag){
 const handlers={},attributes={};
 const n={tagName:tag,hidden:false,disabled:false,style:{},dataset:{},
  append(...children){this.children.push(...children);},
  appendChild(c){this.children.push(c);},
  children:[],addEventListener:(name,fn)=>{handlers[name]=fn;},
  setAttribute:(k,v)=>{attributes[k]=v;},
  focus(){this.focused=true;},select(){this.selected=true;},handlers,
  set id(v){this._id=v;ids.set(v,this);},get id(){return this._id;}
 };
 elements.push(n);return n;
}
const doc={head:makeNode('head'),body:makeNode('body'),
 createElement:tag=>makeNode(tag),getElementById:id=>ids.get(id)||null,
 execCommand:()=>false};
const r={sampleSeconds:15,hasSamples:true,events:{
 localShots:2,remoteShots:3,hostCommitted:1,hostAborted:0},
 stages:Object.fromEntries(['writeAckMs','remoteActionEstimatedAgeMs','receiveToFirstVisualMs',
 'receiveToReceiptMs','hostQueueWaitMs','hostTransactionMs','sendToReceiptMs']
 .map(k=>[k,{samples:2,p50Ms:40,p95Ms:80,maxMs:80}]))};
let running=false,starts=0,stops=0,v35Starts=0,v35Stops=0,copied='';
const env={window:{
 __brawlLagV39QA:{start:()=>{starts++;running=true;return {running:true};},
  stop:()=>{stops++;running=false;return r;},status:()=>({running})},
 __brawlLatencyV35QA:{start:ms=>{assert.equal(ms,250);v35Starts++;return {running:true};},
  stop:()=>{v35Stops++;return {presentation:{framesPerSecond:55,frameGapsOver100ms:2},
   traffic:{gameSnapshotsPerSecond:12}}}}
},document:doc,navigator:{clipboard:{writeText:async v=>{copied=v;}}},
Object,Math,Number,Error};
vm.createContext(env);
vm.runInContext(src,env);
assert.equal(starts,0,'not started without user interaction');
assert.equal(v35Starts,0,'no periodic profiling before opt-in');
assert.equal(env.window.__brawlLagV40UI.status().running,false);
assert.equal(ids.get('brawlV40Panel').hidden,true);
ids.get('brawlV40Open').handlers.click();
assert.equal(ids.get('brawlV40Panel').hidden,false,'open on tap');
ids.get('brawlV40Start').handlers.click();
assert.equal(starts,1);assert.equal(v35Starts,1);
assert.equal(env.window.__brawlLagV40UI.status().running,true);
assert.equal(ids.get('brawlV40Panel').hidden,true,'hide UI during match');
ids.get('brawlV40Open').handlers.click();
ids.get('brawlV40Stop').handlers.click();
assert.equal(stops,1);assert.equal(v35Stops,1);
const report=ids.get('brawlV40Result').value;
assert(report.includes('送信した弾：2 / 他人の弾の受信：3'));
assert(report.includes('画面フレーム：55fps'));
assert(report.includes('時計の誤差'),'clock limitations must be visible');
assert(!report.includes('PRIVATE_ROOM_ID')&&!report.includes('12345'),'no room ID in summary');
assert(!/真のpingを計測しました/.test(report),'no false RTT claims');
(async()=>{
 await ids.get('brawlV40Copy').handlers.click();
 assert.equal(copied,report,'copy requires explicit user press');
 assert.equal(ids.get('brawlV40State').textContent,'結果をコピーできたよ。');
 ids.get('brawlV40Close').handlers.click();
 assert.equal(ids.get('brawlV40Panel').hidden,true,'close does not restart measurements');
 assert.equal(starts,1);
 console.log('PASS V4.0 opt-in touch panel, local-only measurement, copy, no live changes, isolated staging');
})().catch(e=>{console.error(e);process.exitCode=1;});
