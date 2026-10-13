// BRAWL 1vs1 school iPad diagnostic iframe test.
// Runs the identical HTML inside two restrictive iframe configurations; no external resources needed.
'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('playwright-core');
const src=fs.readFileSync(path.resolve(__dirname,'../sites/1vs1-ipad-diagnostic-v2.html'),'utf8');
assert(!src.includes('http-equiv="Content-Security-Policy"'),'diagnostic must test without meta CSP');
assert(src.includes('JS起動 OK')&&src.includes('window.__brawlEmbedDiag?.ready()'));
assert(!/<script\s+src=/i.test(src),'self-contained script');
const chrome=['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium','/usr/bin/chromium-browser'].find(fs.existsSync);
if(!chrome)throw Error('Chromium required');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:chrome,args:['--no-sandbox','--disable-dev-shm-usage']});
 try{
  for(const sandbox of ['allow-scripts','allow-scripts allow-same-origin']){
   const ctx=await browser.newContext({viewport:{width:844,height:390},hasTouch:true,isMobile:true,deviceScaleFactor:2});
   const p=await ctx.newPage(),errors=[];
   p.on('pageerror',e=>errors.push(String(e.message)));
   await p.goto('about:blank');
   await p.evaluate(({src,sandbox})=>{
    const frame=document.createElement('iframe');
    frame.setAttribute('sandbox',sandbox);
    frame.style.cssText='position:fixed;inset:0;width:100%;height:100%;border:0';
    document.body.style.margin='0';document.body.appendChild(frame);
    frame.srcdoc=src;
   },{src,sandbox});
   const frame=p.frameLocator('iframe');
   try {
    await frame.locator('#brawlDiag').waitFor({timeout:13000});
    await p.waitForFunction(()=>document.querySelector('iframe')?.contentWindow!==null,{timeout:10000});
    const initial=await frame.locator('#brawlDiag').innerText();
    assert.match(initial,/JS OK/,sandbox+' main setup should complete: '+initial);
    await frame.locator('#soloBtn').tap();
    await p.waitForTimeout(350);
    const after=await frame.locator('#brawlDiag').innerText();
    assert.match(after,/scene=select/,sandbox+' BOT screen should open: '+after);
    assert.equal(errors.length,0,sandbox+' unexpected error: '+errors.join('; '));
    console.log('PASS iframe ['+sandbox+']: '+after);
   }finally{await ctx.close();}
  }
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
