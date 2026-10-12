// KO Desktop + AREA touch smoke for tank role-rework candidate (Chromium only).
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright-core');
const exe=['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium','/usr/bin/chromium-browser'].find(fs.existsSync);
if(!exe)throw Error('Chromium unavailable');
const pageUrl='file://'+path.resolve(__dirname,'../foundation/2v2-open-arena-team-guard-lab.html');
async function test(browser,touch,mode){
 const ctx=await browser.newContext({viewport:touch?{width:1024,height:768}:{width:1220,height:780},isMobile:touch,hasTouch:touch,deviceScaleFactor:touch?2:1});
 const page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 try{
  await page.goto(pageUrl,{waitUntil:'load'});
  assert((await page.locator('h1').first().textContent()).includes('TANK SUPPORT ONLY'),'updated mode label');
  await page.locator('#soloBtn').click();
  await page.waitForFunction(()=>window.__brawlV3QA?.().scene==='lobby',{timeout:10000});
  if(mode==='area')await page.locator('#modePick [data-mode="area"]').click();
  await page.locator('#readyBtn').click();
  await page.waitForFunction(()=>{const s=window.__brawlV3QA?.();return s?.scene==='game'&&s?.game==='playing'&&s?.combat?.clock?.t>=250},{timeout:22000});
  const v=await page.evaluate(()=>window.__brawlV3QA());
  assert(v.teamGuardLab&&v.tankBalanceLab&&v.openArenaLab,'both previous labs present');
  assert.equal(v.worldWidth,1920);assert.equal(v.worldHeight,1120);assert.equal(v.mode,mode);
  assert.equal(v.stats[v.myId].char,'tank');
  assert.equal(v.hp[v.myId],160);
  assert(Object.keys(v.botActors).length>=3,'three BOTs moving in wide arena');
  assert.equal(errors.length,0,'no exceptions '+errors.join(' | '));
  const dest=path.resolve(__dirname,'../artifacts');fs.mkdirSync(dest,{recursive:true});
  await page.screenshot({path:path.join(dest,'team-guard-'+mode+(touch?'-tablet':'-desktop')+'.png'),fullPage:true});
  console.log('PASS team guard '+mode+' '+(touch?'touch':'desktop')+' BOT match; no errors');
 }finally{await ctx.close();}
}
(async()=>{const b=await chromium.launch({headless:true,executablePath:exe,args:['--no-sandbox','--disable-dev-shm-usage']});try{await test(b,false,'ko');await test(b,true,'area');}finally{await b.close()}})().catch(e=>{console.error(e);process.exitCode=1});
