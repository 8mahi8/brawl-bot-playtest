// Actual offline Chrome/Desktop and touch/HOT ZONE test for tank balance candidate; not school iPad Safari.
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright-core');
const exe=['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium','/usr/bin/chromium-browser'].find(fs.existsSync);
if(!exe)throw Error('Chromium unavailable');
const url='file://'+path.resolve(__dirname,'../foundation/2v2-open-arena-tank-lab.html');
async function run(browser,touch,mode){const viewport=touch?{width:1024,height:768}:{width:1220,height:780};const context=await browser.newContext({viewport,isMobile:touch,hasTouch:touch,deviceScaleFactor:touch?2:1});const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 try{
  await page.goto(url,{waitUntil:'load'});
  assert((await page.locator('h1').textContent()).includes('TANK 160HP'),'candidate correctly labeled');
  await page.locator('#soloBtn').click();
  await page.waitForFunction(()=>window.__brawlV3QA?.().scene==='lobby',{timeout:10000});
  if(mode==='area')await page.locator('#modePick [data-mode="area"]').click();
  await page.locator('#readyBtn').click();
  await page.waitForFunction(()=>{const q=window.__brawlV3QA?.();return q?.scene==='game'&&q?.game==='playing'&&q?.combat.clock.t>250;},{timeout:22000});
  const q=await page.evaluate(()=>window.__brawlV3QA());
  assert(q.tankBalanceLab&&q.openArenaLab,'both wide arena and tank experiment active');
  assert.equal(q.mode,mode,'KO/AREA mode correct');
  assert.equal(q.stats[q.myId].char,'tank','default selected character tank');
  assert.equal(q.hp[q.myId],160,'host state uses tank maximum 160');
  assert.equal(q.worldWidth,1920);assert.equal(q.worldHeight,1120);
  assert(Object.keys(q.botActors).length>=3,'team and opponent bots active');
  assert.equal(errors.length,0,'JS errors '+errors.join(' | '));
  const dir=path.resolve(__dirname,'../artifacts');fs.mkdirSync(dir,{recursive:true});
  await page.screenshot({path:path.join(dir,'tank-lab-'+mode+(touch?'-tablet':'-desktop')+'.png'),fullPage:true});
  console.log('PASS tank balance '+mode+' '+(touch?'touch':'desktop')+' correct 160HP, full wide map, active match');
 }catch(e){throw Error(mode+': '+(e.stack||e)+'; JS errors='+errors.join(' | '));}
 finally{await context.close();}
}
(async()=>{const browser=await chromium.launch({headless:true,executablePath:exe,args:['--no-sandbox','--disable-dev-shm-usage']});try{
 await run(browser,false,'ko');await run(browser,true,'area');
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
