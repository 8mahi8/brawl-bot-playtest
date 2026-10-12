// Browser E2E gate, launched by .github/workflows/tactical-r4-browser-smoke.yml
// Uses runner-provided Chrome and playwright-core, not a Firebase backend.
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright-core');
const browserPaths=['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium','/usr/bin/chromium-browser'];
const executablePath=browserPaths.find(p=>fs.existsSync(p));
if(!executablePath)throw Error('No Chromium/Google Chrome binary on runner');
const url='file://'+path.resolve(__dirname,'../2v2-ui-guardian-r4-test.html');
const folder=path.resolve(__dirname,'../artifacts');
fs.mkdirSync(folder,{recursive:true});
async function run(browser,name,opts){
 const context=await browser.newContext({viewport:opts.viewport,deviceScaleFactor:opts.touch?2:1,isMobile:!!opts.touch,hasTouch:!!opts.touch});
 const page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(String(e.message)));
 try{
  await page.goto(url,{waitUntil:'load'});
  await page.waitForFunction(()=>typeof window.__brawlV3QA==='function',null,{timeout:10000});
  await page.locator('#soloBtn').click();
  await page.waitForFunction(()=>window.__brawlV3QA?.().scene==='lobby',null,{timeout:10000});
  await page.locator('#botFreeze').check();
  await page.locator('#readyBtn').click();
  await page.waitForFunction(()=>window.__brawlV3QA?.().scene==='game',null,{timeout:20000});
  await page.waitForFunction(()=>{const q=window.__brawlV3QA?.();return q?.game==='playing'&&q?.combat?.clock?.t>=100;},null,{timeout:20000});
  const before=await page.evaluate(()=>window.__brawlV3QA());
  assert.equal(before.guardianR4,true,'R4 build loaded');
  assert.equal(before.mode,'ko','KO mode started');
  assert.equal(Object.keys(before.stats).length,4,'4 combat actors');
  await page.locator('#skillInfoToggle').click();
  assert(await page.locator('#skillInfoPanel').isVisible(),'ability guide opens');
  const guide=await page.locator('#skillInfoText').textContent();
  assert(guide.includes('ガーディアンリンク'),'tank guide exists');
  await page.locator('#skillInfoToggle').click();
  assert(!(await page.locator('#skillInfoPanel').isVisible()),'guide closes');
  await page.locator('#botTools').click();
  await page.locator('#practiceGad').click();
  await page.locator('#practiceUlt').click();
  await page.waitForFunction(()=>{const q=window.__brawlV3QA();return q.stats?.[q.myId]?.ult===100&&q.stats?.[q.myId]?.gadgets>0;},null,{timeout:8000});
  await page.locator('#botSetupClose').click();
  // Regression for the reported mini-map blocking ULT: inspect actual hit-testing at button centers.
  const geometry=await page.evaluate(()=>{
   const map=document.getElementById('mapDock'),buttons=['gadAction','ultAction'].map(id=>document.getElementById(id));
   const box=el=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,left:r.left,top:r.top,right:r.right,bottom:r.bottom,cx:r.left+r.width/2,cy:r.top+r.height/2};};
   const mr=box(map);
   return {compact:map.classList.contains('compact'),map:mr,viewport:{w:innerWidth,h:innerHeight},
    controls:buttons.map(el=>{const r=box(el),top=document.elementFromPoint(r.cx,r.cy),overlap=!map.classList.contains('compact')&&r.left<mr.right+8&&r.right>mr.left-8&&r.top<mr.bottom+8&&r.bottom>mr.top-8;
    return {id:el.id,rect:r,hit:top?.id,overlap};})};
  });
  for(const b of geometry.controls){
   assert.equal(b.hit,b.id,'action '+b.id+' must be topmost at its center');
   assert(!b.overlap,'action '+b.id+' must not overlap the expanded mini-map');
   assert(b.rect.left>=0&&b.rect.right<=geometry.viewport.w+2&&b.rect.top>=0&&b.rect.bottom<=geometry.viewport.h+2,'action inside viewport '+b.id);
  }
  await page.locator('#mapExpand').click();
  const mapExpanded=await page.locator('#mapExpand').getAttribute('aria-expanded');
  assert(['true','false'].includes(mapExpanded),'map toggle maintains accessible expanded state');
  // A second toggle should not cover action controls even if the map cannot expand.
  await page.locator('#mapExpand').click();
  assert.equal(await page.locator('#ultAction').isVisible(),true,'ULT remains visible after map toggles');
  const action=page.locator('#gadAction');
  await action.waitFor({state:'visible'});
  await page.waitForFunction(()=>{const b=document.querySelector('#gadAction');return b&&!b.disabled;},null,{timeout:8000});
  if(opts.touch)await action.tap();else await action.click();
  await page.waitForFunction(()=>{const q=window.__brawlV3QA();return (q.stats?.[q.myId]?.guardUntil||0)>0;},null,{timeout:10000});
  const after=await page.evaluate(()=>window.__brawlV3QA());
  assert(after.stats[after.myId].guardUntil>0,'tank guard activated');
  assert(after.stats[after.myId].gadgets<before.stats[before.myId].gadgets,'consumed gadget');
  assert(errors.length===0,'uncaught browser JS error: '+errors.join(' | '));
  await page.screenshot({path:path.join(folder,'r4-'+name+'.png'),fullPage:true});
  console.log('PASS R4 browser '+name+': live UI hit test, solo KO, help, practice tools, Guardian Link; errors=0');
 }catch(err){
  await page.screenshot({path:path.join(folder,'r4-'+name+'-failure.png'),fullPage:true}).catch(()=>{});
  throw Error(name+': '+String(err.stack||err)+'; browser errors: '+errors.join(' | '));
 }finally{await context.close();}
}
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath,args:['--no-sandbox','--disable-dev-shm-usage']});
 try{
  await run(browser,'desktop',{viewport:{width:1220,height:780},touch:false});
  await run(browser,'touch-landscape',{viewport:{width:844,height:390},touch:true});
  await run(browser,'touch-portrait',{viewport:{width:390,height:844},touch:true});
  await run(browser,'small-touch-landscape',{viewport:{width:667,height:375},touch:true});
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
