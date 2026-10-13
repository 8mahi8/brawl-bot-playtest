// Verify 1vs1 BOT setup and play inside opaque and same-origin iframe sandboxes,
// emulating the iPad Safari WebKit viewport used to view Google Sites embed-code HTML.
// This cannot reproduce school-managed Safari policies or Google's HTML sanitation.
'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {webkit}=require('playwright-core');
const root=path.resolve(__dirname,'..');
const variants=[
  {path:'sites/1vs1-ipad-bot-embed.html',label:'original',required:false},
  {path:'sites/1vs1-ipad-diagnostic-v2.html',label:'diagnostic',required:true}
];
(async()=>{
  const browser=await webkit.launch({headless:true});
  let failures=0;
  try{
    for(const item of variants)for(const sandbox of ['allow-scripts','allow-scripts allow-same-origin']){
      const ctx=await browser.newContext({
        viewport:{width:844,height:390},
        hasTouch:true,isMobile:true,deviceScaleFactor:2,locale:'ja-JP'
      });
      const page=await ctx.newPage(),errors=[];
      page.on('pageerror',e=>errors.push(e.message));
      const src=fs.readFileSync(path.join(root,item.path),'utf8');
      try{
        await page.setContent('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body></body></html>');
        await page.evaluate(({source,policy})=>{
          const frame=document.createElement('iframe');
          frame.setAttribute('sandbox',policy);
          frame.style.cssText='position:fixed;inset:0;width:100%;height:100%;border:0';
          document.body.style.margin='0';
          document.body.appendChild(frame);
          frame.srcdoc=source;
        },{source:src,policy:sandbox});
        const f=page.frameLocator('iframe');
        await f.locator('#soloBtn').waitFor({timeout:13000});
        if(item.label==='diagnostic'){
          await f.locator('#brawlDiag').waitFor({timeout:10000});
          await page.waitForTimeout(400);
          const diag=await f.locator('#brawlDiag').innerText();
          assert.match(diag,/JS OK/, 'diagnostic should confirm loaded JS: '+diag);
        }
        const hit=await f.locator('#soloBtn').evaluate(el=>{const r=el.getBoundingClientRect(),x=r.left+r.width/2,y=r.top+r.height/2;return {rect:{x:r.x,y:r.y,w:r.width,h:r.height},hit:document.elementFromPoint(x,y)?.id||document.elementFromPoint(x,y)?.tagName,viewport:{w:innerWidth,h:innerHeight}};});
        console.log('HIT '+item.label+' ['+sandbox+']: '+JSON.stringify(hit));
        await f.locator('#soloBtn').tap({timeout:10000});
        await f.locator('#charScreen:not(.hidden)').waitFor({timeout:10000});
        if(item.label==='diagnostic'){
          await page.waitForTimeout(300);
          const diag=await f.locator('#brawlDiag').innerText();
          assert.match(diag,/scene=select/, 'diagnostic should expose selected scene: '+diag);
        }
        await f.locator('#readyBtn').tap({timeout:10000});
        await f.locator('#hud:not(.hidden)').waitFor({timeout:10000});
        await page.waitForTimeout(1500);
        const actualScene=await f.locator('#appStage').getAttribute('data-scene');
        assert.equal(actualScene,'game');
        assert.deepEqual(errors,[],'unhandled JavaScript errors: '+errors.join(' | '));
        console.log('PASS WebKit iPad iframe '+item.label+' ['+sandbox+']: lobby -> select -> game');
      }catch(e){
        console.error((item.required?'FAIL':'BASELINE-FAIL')+' '+item.label+' ['+sandbox+'] '+String(e?.message||e).slice(0,650)+' / errors='+errors.join(' | '));
        if(item.required)failures++;
      }finally{await ctx.close();}
    }
  }finally{await browser.close();}
  if(failures)process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1;});
