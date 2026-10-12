// Actual Chromium desktop/touch KO+AREA smoke for the independent wide arena. Not Safari.
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright-core');
const exe=['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium','/usr/bin/chromium-browser'].find(fs.existsSync);
if(!exe)throw Error('Chromium unavailable');
const target='file://'+path.resolve(__dirname,'../foundation/2v2-open-arena-lab.html');
async function attempt(browser,viewport,touch,mode){
 const context=await browser.newContext({viewport,isMobile:touch,hasTouch:touch,deviceScaleFactor:touch?2:1});
 const page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 try{
  await page.goto(target,{waitUntil:'load'});
  await page.locator('#soloBtn').click();
  await page.waitForFunction(()=>window.__brawlV3QA?.().scene==='lobby',{timeout:12000});
  if(mode==='area')await page.locator('#modePick [data-mode="area"]').click();
  await page.locator('#readyBtn').click();
  await page.waitForFunction(()=>{const q=window.__brawlV3QA?.();return q?.game==='playing'&&q?.combat?.clock?.t>=250;},{timeout:22000});
  let q=await page.evaluate(()=>window.__brawlV3QA());
  assert(q.openArenaLab&&q.worldWidth===1920&&q.worldHeight===1120,'new world active');
  assert.equal(q.mode,mode,'correct rules mode');
  assert(Object.keys(q.botActors).length>=3,'3 live BOT opponents/allies');
  const cam=await page.locator('#cameraToggle');
  await cam.click();assert((await cam.textContent()).includes('追従カメラ'),'map overview toggle works');
  await cam.click();assert((await cam.textContent()).includes('全景表示'),'follow camera works');
  const pos=q.local;
  // Desktop moving with keyboard should traverse the new world; on touch just inspect controls.
  if(!touch){await page.keyboard.down('d');await page.waitForTimeout(300);await page.keyboard.up('d');q=await page.evaluate(()=>window.__brawlV3QA());assert(q.local.x>pos.x+7,'player movement traverses expanded map');}
  const minimap=page.locator('#miniMap');assert(await minimap.count()===1,'world minimap present');
  assert.equal(errors.length,0,'uncaught JS error '+errors.join(' | '));
  const dir=path.resolve(__dirname,'../artifacts');fs.mkdirSync(dir,{recursive:true});
  await page.screenshot({path:path.join(dir,'open-arena-'+mode+(touch?'-tablet':'-desktop')+'.png'),fullPage:true});
  console.log('PASS Open Arena LAB '+mode+' '+(touch?'tablet':'desktop')+' camera / bots / world');
 }catch(e){const dir=path.resolve(__dirname,'../artifacts');fs.mkdirSync(dir,{recursive:true});await page.screenshot({path:path.join(dir,'open-arena-'+mode+(touch?'-tablet':'-desktop')+'-failure.png'),fullPage:true}).catch(()=>{});throw e;}
 finally{await context.close();}
}
(async()=>{const browser=await chromium.launch({headless:true,executablePath:exe,args:['--no-sandbox','--disable-dev-shm-usage']});try{
 await attempt(browser,{width:1220,height:780},false,'ko');
 await attempt(browser,{width:1024,height:768},true,'area');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
