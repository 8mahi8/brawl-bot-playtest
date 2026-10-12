// UI preview generator: headless screenshots for visual review, not a gameplay pass/fail test.
// Logs compact JPEG chunks so the design reviewer can inspect real pixels even when
// the GitHub Actions artifact downloader is unavailable.
'use strict';
const fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright-core');
const executablePath=['/usr/bin/google-chrome','/usr/bin/chromium'].find(fs.existsSync);
if(!executablePath)throw Error('Chromium binary missing');
const target='file://'+path.resolve(__dirname,'../2v2-ui-clean-r4-1-test.html');
async function capture(browser,name,width,height){
 const context=await browser.newContext({viewport:{width,height},isMobile:true,hasTouch:true,deviceScaleFactor:1});
 try{
  const page=await context.newPage();
  await page.goto(target,{waitUntil:'load'});
  await page.locator('#soloBtn').click();
  await page.waitForFunction(()=>window.__brawlV3QA?.().scene==='lobby');
  await page.locator('#botFreeze').check();
  await page.locator('#readyBtn').click();
  await page.waitForFunction(()=>window.__brawlV3QA?.().scene==='game',null,{timeout:15000});
  await page.waitForFunction(()=>window.__brawlV3QA?.().game==='playing',null,{timeout:18000});
  await page.waitForTimeout(400);
  const jpg=await page.screenshot({type:'jpeg',quality:46,fullPage:false});
  console.log('UI_CAPTURE_BEGIN '+name+' '+width+'x'+height);
  const encoded=jpg.toString('base64');for(let i=0;i<encoded.length;i+=900)console.log('UI_CAPTURE_DATA '+encoded.slice(i,i+900));
  console.log('UI_CAPTURE_END '+name);
  console.log('UI_CAPTURE_METRICS '+name+' '+JSON.stringify(await page.evaluate(()=>({
    overlay: ['guardMeter','guardAlert','skillToast'].map(id=>({id,visible:!!document.getElementById(id)&&getComputedStyle(document.getElementById(id)).display!=='none'})),
    hud:document.getElementById('hud').getBoundingClientRect().toJSON(),
    map:document.getElementById('mapDock').getBoundingClientRect().toJSON(),
    gad:document.getElementById('gadAction').getBoundingClientRect().toJSON(),
    ult:document.getElementById('ultAction').getBoundingClientRect().toJSON()
  }))));
 }finally{await context.close();}
}
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath,args:['--no-sandbox','--disable-dev-shm-usage']});
 try{await capture(browser,'landscape',844,390);await capture(browser,'portrait',390,844);}
 finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
