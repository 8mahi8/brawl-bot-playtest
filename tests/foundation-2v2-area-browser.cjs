// Browser E2E: real offline HOT ZONE match, with tactical capture/guard bots.
// This is Chromium, NOT school-iPad Safari or multiplayer networking.
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright-core');
const execs=['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium','/usr/bin/chromium-browser'];
const exe=execs.find(p=>fs.existsSync(p));if(!exe)throw Error('Chrome/Chromium not installed');
const url='file://'+path.resolve(__dirname,'../foundation/2v2-foundation-v1.html');
async function run(browser,name,touch,viewport){
 const context=await browser.newContext({viewport,deviceScaleFactor:touch?2:1,isMobile:touch,hasTouch:touch});
 const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
 try{
  await page.goto(url,{waitUntil:'load'});
  await page.locator('#soloBtn').click();
  await page.waitForFunction(()=>window.__brawlV3QA?.().scene==='lobby',{timeout:10000});
  await page.locator('#modePick [data-mode="area"]').click();
  await page.waitForFunction(()=>window.__brawlV3QA?.().lobby?.mode==='area',{timeout:10000});
  await page.locator('#readyBtn').click();
  await page.waitForFunction(()=>{const q=window.__brawlV3QA?.();return q?.scene==='game'&&q.mode==='area'&&q.game==='playing'&&q.combat.clock.t>=300;},{timeout:22000});
  const before=await page.evaluate(()=>window.__brawlV3QA());
  assert.equal(before.mode,'area');
  assert(before.combat.area&&typeof before.combat.area.blueMs==='number','AREA authoritative capture state exists');
  assert((await page.locator('#gameBanner').textContent()).includes('HOT ZONE'),'HUD shows correct mode');
  await page.waitForFunction(()=>Object.values(window.__brawlV3QA()?.botActors||{}).some(b=>['capture','contest','hold'].includes(b.brain?.tactic)),{timeout:10000});
  // Look for real bot movement toward the point from live browser positions,
  // not a mock function return. Center is (768,430) in the generated 2v2 map.
  const start=await page.evaluate(()=>{
   const bots=window.__brawlV3QA().botActors;
   return Object.fromEntries(Object.entries(bots).map(([id,b])=>[id,Math.hypot(b.x-768,b.y-430)]));
  });
  await page.waitForFunction(start=>{
   const bots=window.__brawlV3QA()?.botActors||{};
   return Object.entries(bots).some(([id,b])=>start[id]!==undefined&&Math.hypot(b.x-768,b.y-430)<start[id]-12);
  },start,{timeout:14000});
  const q=await page.evaluate(()=>window.__brawlV3QA());
  assert.equal(q.mode,'area');assert(Object.keys(q.botActors).length>=3,'three bots operating');
  assert.equal(errors.length,0,'no JS exceptions: '+errors.join(' | '));
  fs.mkdirSync(path.resolve(__dirname,'../artifacts'),{recursive:true});
  await page.screenshot({path:path.resolve(__dirname,'../artifacts/foundation-v1-area-'+name+'.png'),fullPage:true});
  console.log('PASS '+name+' real HOT ZONE browser match; allied/opponent BOT active, objective tactics and motion, HUD, errors=0');
 }catch(e){await page.screenshot({path:path.resolve(__dirname,'../artifacts/foundation-v1-area-'+name+'-failure.png'),fullPage:true}).catch(()=>{});throw Error(name+': '+String(e.stack||e)+'; pageErrors='+errors.join(' | '));}
 finally{await context.close();}
}
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:exe,args:['--no-sandbox','--disable-dev-shm-usage']});
 try{await run(browser,'desktop',false,{width:1220,height:780});await run(browser,'tablet-landscape',true,{width:1024,height:768});}
 finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1});
