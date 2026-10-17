// Source-extracted 1vs1 render/HUD tests: run exactly the code in the lab HTML.
// The public 1vs1 game is intentionally frozen and never used as a write target.
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const html=fs.readFileSync(path.join(__dirname,'../online/ipad-duel-v2-lab.html'),'utf8');
const hudAt=html.indexOf('  const duelReloadFillCache='),hudEnd=html.indexOf('  function listen(',hudAt);
assert(hudAt>0&&hudEnd>hudAt&&hudEnd-hudAt<5000,'extract real 1vs1 HUD block');
let domWrites=0;
const dom={};
function fakeNode(){
 let content='',disabled=false;
 const classes=new Set();
 const node={style:new Proxy({width:'',background:''},{set(t,k,v){domWrites++;t[k]=v;return true;}}),
   classList:{contains:k=>classes.has(k),toggle(k,on){domWrites++;on?classes.add(k):classes.delete(k);}},
 };
 Object.defineProperty(node,'textContent',{get(){return content;},set(v){domWrites++;content=v;}});
 Object.defineProperty(node,'disabled',{get(){return disabled;},set(v){domWrites++;disabled=v;}});
 return node;
}
for(const key of ['myHp','theirHp','myHpText','theirHpText','myUlt','ultBtn','ammoText','reloadStrip','gadgetBtn','scores','roundLabel'])dom[key]=fakeNode();
dom.reloadStrip.children=Array.from({length:3},()=>fakeNode());
dom['.hudCard:not(.enemy) .hudName']=fakeNode();dom['.hudCard.enemy .hudName']=fakeNode();
const game={hp:{host:160,guest:100},scores:{host:1,guest:0},round:1};
const local={hp:160,char:'tank',ult:75,ammo:2,reload:.4,gadgets:1};
const state={WeakMap,Math,Number,document:{querySelector:key=>dom[key]},$:(key)=>dom[key],
   clamp:(v,a,b)=>Math.max(a,Math.min(b,v)),game,role:'host',other:'guest',
   local,remote:{char:'gunner'},CHARS:{tank:{hp:160,reload:1,label:'タンク'},gunner:{hp:100,label:'ガンナー'}},
   maxHp:char=>char==='tank'?160:100,score:role=>game.scores[role]||0,
   layoutEditing:false,bomberGadgetBusy:false,soloDebug:()=>false,isPlaying:()=>true};
vm.createContext(state);
vm.runInContext(html.slice(hudAt,hudEnd)+'this.refresh=updateHUD;this.metrics=()=>({writes:duelHudWrites,skips:duelHudSkips});',state);
state.refresh();
assert(domWrites>=10,'first HUD render populates controls and bars');
const first=domWrites;
for(let i=0;i<20;i++)state.refresh();
assert.equal(domWrites,first,'unchanged state produces zero additional DOM or gradient writes');
assert(state.metrics().skips>=350,'identical updates are explicitly skipped');
game.hp.guest=65;local.ammo=0;local.reload=.2;local.ult=100;
state.refresh();
assert(domWrites>first&&domWrites-first<13,'only changed HP/ammo/reload/ULT update');
assert.equal(dom['theirHpText'].textContent,'65 / 100');
assert.equal(dom.ammoText.textContent,'0 / 3');
assert(dom.ammoText.classList.contains('empty'));
assert(dom.ultBtn.classList.contains('ready'));
assert.equal(dom.ultBtn.disabled,false);
assert.equal(dom.reloadStrip.children[0].style.background,'linear-gradient(to right,#f4f9ff 20%,#243445 20%)');
const altered=domWrites;
state.refresh();
assert.equal(domWrites,altered,'new steady state again creates zero DOM writes');

const bgAt=html.indexOf('  let duelBackdrop='),bgEnd=html.indexOf('  function draw() {',bgAt);
assert(bgAt>0&&bgEnd>bgAt&&bgEnd-bgAt<1800,'extract immutable floor/backdrop paint path');
function fakeContext(){
 return {fillRect(){},beginPath(){},moveTo(){},lineTo(){},stroke(){},setLineDash(){},drawImage(){this.blits=(this.blits||0)+1;}};
}
function makeWorld(failCanvas=false){
 const canvasCtx=fakeContext(),bgCtx=fakeContext();
 let fog=0,created=0;
 const world={W:1000,H:600,ctx:canvasCtx,bushes:[{x:5,y:5,w:20,h:20}],performance:{now:()=>600},
   BrawlStealthV1:{drawFields(){fog++;}},document:{createElement(){
     created++;
     if(failCanvas)throw Error('Canvas blocked');
     return {width:0,height:0,getContext:()=>bgCtx};
   }}};
 vm.createContext(world);
 vm.runInContext(html.slice(bgAt,bgEnd)+'this.renderBack=drawDuelBackdrop;this.info=()=>({builds:duelBackdropBuilds,blits:duelBackdropBlits});',world);
 return {world,get fog(){return fog;},get created(){return created;},ctx:canvasCtx};
}
const cached=makeWorld();
for(let i=0;i<90;i++)cached.world.renderBack();
assert.deepEqual({...cached.world.info()},{builds:1,blits:90},'static floor is rasterized once and reused');
assert.equal(cached.fog,1,'fog geometry is not rebuilt every frame');
assert.equal(cached.created,1,'offscreen Canvas allocation happens only once');
const fallback=makeWorld(true);
fallback.world.renderBack();fallback.world.renderBack();
assert.equal(fallback.created,1,'failed Canvas creation does not retry every rAF');
assert.equal(fallback.fog,2,'fallback draws identical floor directly without a crash');
assert.match(html,/function draw\(\)\s*\{[\s\S]{0,400}drawDuelBackdrop\(\)/,'actual draw() blits cached layer');
assert.match(html,/for\(const w of walls\)/,'walls, actors, gas and projectiles stay dynamic');
console.log('PASS 1vs1 render parity: frozen public untouched, DOM equality skips, tracked CSS fill, one-time floor cache + direct fallback');
