// BRAWL Foundation generated 1vs1 — browser BOT sanity, independent from 2vs2 runtime.
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright-core');
const executablePath=['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium','/usr/bin/chromium-browser'].find(fs.existsSync);
if(!executablePath)throw Error('Chrome or Chromium is required');
const filename=path.resolve(__dirname,'../foundation/1v1-foundation-v1.html');
async function test(browser,label,viewport,touch){
 const c=await browser.newContext({viewport,hasTouch:touch,isMobile:touch,deviceScaleFactor:touch?2:1});
 const page=await c.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 try{
  await page.goto('file://'+filename,{waitUntil:'load'});
  await page.waitForFunction(()=>typeof window.__brawlV29QA==='function',null,{timeout:12000});
  await page.locator('#soloBtn').click();
  await page.waitForFunction(()=>{const q=window.__brawlV29QA();return q.scene==='select'&&q.solo;},null,{timeout:10000});
  await page.locator('#readyBtn').click();
  await page.waitForFunction(()=>{const q=window.__brawlV29QA();return q.scene==='game'&&q.game?.phase==='playing';},null,{timeout:10000});
  await page.waitForTimeout(1200);
  const before=await page.evaluate(()=>window.__brawlV29QA());
  assert.equal(before.solo,true,'1vs1 offline BOT is active');
  assert.equal(before.game.round,1,'1vs1 first round');
  assert.equal(before.game.chars.host,'tank','default tank');
  assert.equal(before.game.hp.host,180,'shared tank HP');
  const positions=await page.evaluate(()=>{
   const ids=['gadgetBtn','ultBtn'],r=[];
   for(const id of ids){
    const el=document.getElementById(id),b=el.getBoundingClientRect();
    const hit=document.elementFromPoint(b.left+b.width/2,b.top+b.height/2);
    r.push({id,visible:b.width>0&&b.height>0,inside:b.left>=0&&b.top>=0&&b.right<=innerWidth+2&&b.bottom<=innerHeight+2,hit:hit?.id});
   }
   return r;
  });
  for(const b of positions){assert(b.visible&&b.inside,'1v1 '+b.id+' must be within screen');assert.equal(b.hit,b.id,'1v1 '+b.id+' is directly hittable');}
  const gadget=page.locator('#gadgetBtn');
  if(touch)await gadget.tap();else await gadget.click();
  const after=await page.evaluate(()=>window.__brawlV29QA());
  assert.equal(after.local.gadgets,before.local.gadgets-1,'1v1 tank gadget spends exactly one charge');
  assert.equal(errors.length,0,'uncaught JS: '+errors.join(' / '));
  const folder=path.resolve(__dirname,'../artifacts');fs.mkdirSync(folder,{recursive:true});
  await page.screenshot({path:path.join(folder,'foundation-v1-1vs1-'+label+'.png'),fullPage:true});
  console.log('PASS generated 1vs1 '+label+': solo BOT, round, shared stats, both action hit tests, tank GAD, JS errors=0');
 }catch(e){throw Error(label+': '+String(e.stack||e)+'; '+errors.join(' / '));}
 finally{await c.close();}
}
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath,args:['--no-sandbox','--disable-dev-shm-usage']});
 try{
  await test(browser,'desktop',{width:1220,height:780},false);
  await test(browser,'tablet-landscape',{width:844,height:390},true);
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
