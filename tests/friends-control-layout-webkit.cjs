// Verify the GENERATED four-mode editor UI against its unchanged source in
// real Safari-like WebKit, using the same saved preferences and viewport.
// No Firebase, Google Sites or live project is contacted by this test.
'use strict';
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {webkit}=require('playwright-core');
const root=path.resolve(__dirname,'..');
const {spec}=require('../scripts/build-friends-online.cjs');
const pages={};
for(const [name,mode] of Object.entries(spec.modes)){
 pages['/'+name+'/source']=fs.readFileSync(path.join(root,mode.source),'utf8');
 pages['/'+name+'/staged']=fs.readFileSync(path.join(root,mode.output),'utf8');
}
const server=http.createServer((req,res)=>{
 const src=pages[req.url];
 if(!src){res.writeHead(404);res.end();return;}
 res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});res.end(src);
});
const pref={
 'brawl_v28_buttons':JSON.stringify({
  gadget:{x:.39,y:.74,size:88},ult:{x:.83,y:.32,size:72}
 }),
 'brawl-v3-2v2-r4-layout':JSON.stringify({
  gad:{x:.35,y:.75,size:86},ult:{x:.86,y:.32,size:74}
 }),
 'brawl-draft-2v2-gad2-layout-v1':JSON.stringify({x:.73,y:.57,size:82})
};
function snapshotCode(name){
 const duel=name.endsWith('1vs1');
 const ids=duel?['gadgetBtn','ultBtn']:
  name==='draft.2vs2'?['mockGad','mockUlt','gadAction','ultAction','mockGad2','squadGad2Action']:
  ['mockGad','mockUlt','gadAction','ultAction'];
 const el=id=>{
  const node=document.getElementById(id);
  if(!node)throw Error('No control DOM: '+id);
  return {left:node.style.left,top:node.style.top,width:node.style.width,
   height:node.style.height,btnSize:node.style.getPropertyValue('--btn-size')};
 };
 return {styles:Object.fromEntries(ids.map(id=>[id,el(id)])),
  state:ids.map(id=>document.getElementById(id).disabled),
  stage:duel?['appStage'].map(id=>({w:document.getElementById(id).clientWidth,h:document.getElementById(id).clientHeight})):
   ['app'].map(id=>({w:document.getElementById(id).clientWidth,h:document.getElementById(id).clientHeight})),
  controlsKey:localStorage.getItem(duel?'brawl_v28_buttons':'brawl-v3-2v2-r4-layout'),
  gad2Key:localStorage.getItem('brawl-draft-2v2-gad2-layout-v1')
 };
}
async function run(){
 await new Promise(ok=>server.listen(8881,'127.0.0.1',ok));
 let browser;
 try{
  browser=await webkit.launch({headless:true});
  for(const [name,mode]of Object.entries(spec.modes)){
   const ctx=await browser.newContext({viewport:{width:1024,height:620},hasTouch:true,isMobile:true,locale:'ja-JP'});
   const page=await ctx.newPage(),errors=[];
   page.on('pageerror',e=>errors.push(e.message));
   const base='http://127.0.0.1:8881/'+name;
   await page.goto(base+'/source',{waitUntil:'load'});
   await page.waitForFunction(()=>typeof window.__brawlV3QA==='function'||typeof window.__brawlV29QA==='function',
    null,{timeout:16000});
   await page.evaluate(prefs=>{for(const [k,v]of Object.entries(prefs))localStorage.setItem(k,v);},pref);
   await page.reload({waitUntil:'load'});
   await page.waitForFunction(()=>typeof window.__brawlV3QA==='function'||typeof window.__brawlV29QA==='function',
    null,{timeout:16000});
   const previous=await page.evaluate(snapshotCode,name);
   await page.goto(base+'/staged',{waitUntil:'load'});
   await page.waitForFunction(()=>typeof window.__brawlV3QA==='function'||typeof window.__brawlV29QA==='function',
    null,{timeout:16000});
   const generated=await page.evaluate(snapshotCode,name);
   assert.deepEqual(generated,previous,'staged runtime changes button position/size/state/settings '+name);
   assert.deepEqual(errors,[],'WebKit JavaScript errors '+name);
   console.log('PASS WEBKIT control editor '+name+': old preferences, GAD/ULT'+(name==='draft.2vs2'?'/GAD2':'')+' pixel styles identical after shared-runtime build');
   await ctx.close();
  }
 }finally{
  if(browser)await browser.close();
  await new Promise(ok=>server.close(ok));
 }
}
run().catch(e=>{console.error(e);process.exitCode=1;});
