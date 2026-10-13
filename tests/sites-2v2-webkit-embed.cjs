// Check 2vs2 BOT practice embedded in Safari-like iframe sandboxes.
// Distinct from the local-file WebKit suite and not a substitute for managed iPad testing.
'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {webkit}=require('playwright-core');
const variants=[
 {label:'original',path:'sites/2vs2-ipad-bot-embed.html'},
 {label:'diagnostic',path:'sites/2vs2-ipad-diagnostic-v1.html'},
 {label:'scout',path:'sites/2vs2-ipad-ko-scout-v1.html'}
];
(async()=>{
 const browser=await webkit.launch({headless:true});
 try{
  for(const variant of variants)for(const mode of ['ko','area'])for(const policy of ['allow-scripts','allow-scripts allow-same-origin']){
   const source=fs.readFileSync(path.resolve(__dirname,'..',variant.path),'utf8');
   assert.match(source,/<script>/);
   assert.doesNotMatch(source,/<script[^>]+\bsrc=/i);
   const ctx=await browser.newContext({viewport:{width:1024,height:620},isMobile:true,hasTouch:true,deviceScaleFactor:2,locale:'ja-JP'});
   const page=await ctx.newPage(),errors=[];
   page.on('pageerror',e=>errors.push(String(e.message)));
   try{
    await page.setContent('<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body></body></html>');
    await page.evaluate(({source,policy})=>{
      const frame=document.createElement('iframe');
      frame.setAttribute('sandbox',policy);
      frame.style.cssText='position:fixed;inset:0;width:100%;height:100%;border:0';
      document.body.style.margin='0';document.body.appendChild(frame);frame.srcdoc=source;
    },{source,policy});
    const f=page.frameLocator('iframe');
    await f.locator('#soloBtn').tap({timeout:12000});
    await f.locator('#lobbyScreen:not(.hidden)').waitFor({timeout:12000});
    if(mode==='area')await f.locator('#modePick [data-mode="area"]').tap({timeout:10000});
    await f.locator('#readyBtn').tap({timeout:12000});
    await f.locator('#app[data-scene="game"]').waitFor({timeout:20000});
    await page.waitForTimeout(1700);
    if(variant.label==='diagnostic'||variant.label==='scout'){
      const diag=await f.locator('#brawlDiag2v2').innerText();
      if(variant.label==='scout'){
        assert.match(diag,/phase=playing|phase=round_end|phase=match_end/,'scout diagnostic must report match lifecycle: '+diag);
      }else{
        assert.match(diag,/scene=game/,'2vs2 diagnostic must report scene=game: '+diag);
        assert.match(diag,/初期化=済/,'2vs2 diagnostic must report initialization: '+diag);
      }
    }
    const q=await f.locator('#app').evaluate(()=>window.__brawlV3QA?.());
    assert(q&&q.solo&&q.scene==='game','2vs2 BOT game state');
    assert.equal(q.mode,mode,'selected game mode');
    assert.equal(errors.length,0,'2vs2 uncaught JS '+errors.join(' | '));
    console.log('PASS 2vs2 WebKit iframe '+variant.label+' '+mode+' ['+policy+'] starts real offline match');
   }finally{await ctx.close();}
  }
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
