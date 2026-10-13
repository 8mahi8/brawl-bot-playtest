// Independent school-iPad UI smoke review. Does not mutate the existing live pages.
'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {webkit}=require('playwright-core');
const root=path.resolve(__dirname,'..');
const configs=[
 {mode:'1v1',file:'sites/1vs1-ipad-playtest-v2.html',app:'#appStage',controls:['#gadgetBtn','#ultBtn'],selector:'#charScreen:not(.hidden)'},
 {mode:'2v2',file:'sites/2vs2-ipad-playtest-v2.html',app:'#app',controls:['#gadAction','#ultAction'],selector:'#lobbyScreen:not(.hidden)'}
];
(async()=>{
 fs.mkdirSync(path.join(root,'artifacts'),{recursive:true});
 const browser=await webkit.launch({headless:true});
 try{
  for(const config of configs)for(const viewport of [{width:844,height:390},{width:1024,height:620}]){
   const ctx=await browser.newContext({viewport,hasTouch:true,isMobile:true,deviceScaleFactor:2,locale:'ja-JP'});
   const page=await ctx.newPage(),errors=[];
   page.on('pageerror',e=>errors.push(e.message));
   try{
    const source=fs.readFileSync(path.join(root,config.file),'utf8');
    await page.setContent('<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body style="margin:0"></body></html>');
    await page.evaluate(src=>{
     const frame=document.createElement('iframe');frame.setAttribute('sandbox','allow-scripts');frame.style.cssText='position:fixed;inset:0;width:100%;height:100%;border:0';document.body.appendChild(frame);frame.srcdoc=src;
    },source);
    const f=page.frameLocator('iframe');
    await f.locator('#soloBtn').tap({timeout:12000});
    await f.locator(config.selector).waitFor({timeout:12000});
    await f.locator('#readyBtn').tap({timeout:12000});
    await f.locator(config.app+'[data-scene="game"]').waitFor({timeout:20000});
    await page.waitForTimeout(1200);
    const ui=await f.locator(config.app).evaluate((app,selectors)=>{
     const bbox=el=>{const r=el.getBoundingClientRect();return {l:r.left,t:r.top,r:r.right,b:r.bottom,w:r.width,h:r.height};};
     const controls=selectors.map(s=>({id:s,rect:bbox(document.querySelector(s)),style:getComputedStyle(document.querySelector(s)).display}));
     const centerHit=c=>{const p={x:(c.rect.l+c.rect.r)/2,y:(c.rect.t+c.rect.b)/2};return document.elementFromPoint(p.x,p.y)?.id||'';};
     return {vw:innerWidth,vh:innerHeight,app:bbox(app),controls:controls.map(c=>({...c,hit:centerHit(c)})),soundNodes:document.querySelectorAll('audio,video').length};
    },config.controls);
    assert.equal(errors.length,0,'uncaught UI exception: '+errors);
    for(const control of ui.controls){
     assert(control.rect.w>=35&&control.rect.h>=35,'invisible button '+JSON.stringify(control));
     assert(control.rect.l>=-2&&control.rect.t>=-2&&control.rect.r<=ui.vw+2&&control.rect.b<=ui.vh+2,'offscreen button '+JSON.stringify(control));
     assert.equal(control.hit,control.id.slice(1),'button must not be visually covered by another element '+JSON.stringify(control));
    }
    const [a,b]=ui.controls.map(c=>c.rect);
    const x=Math.max(0,Math.min(a.r,b.r)-Math.max(a.l,b.l)),y=Math.max(0,Math.min(a.b,b.b)-Math.max(a.t,b.t));
    assert(x*y<100,'touch buttons overlap');
    assert.equal(ui.soundNodes,0,'game should remain silent at school');
    const filename='artifacts/ipad-polish-'+config.mode+'-'+viewport.width+'x'+viewport.height+'.png';
    await page.screenshot({path:path.join(root,filename),animations:'disabled'});
    console.log('PASS UI '+config.mode+' '+viewport.width+'x'+viewport.height+' touch targets, on-screen, silent. '+filename);
   }finally{await ctx.close();}
  }
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
