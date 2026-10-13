// Isolated school-iPad online integration smoke: never contacts a live Firebase project.
// WebKit exercises the real new BOT/game UI with cloud mode gated by user-provided test URL.
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {webkit}=require('playwright-core');
const root=path.resolve(__dirname,'..');
const modes=[
 {mode:'1vs1',file:'online/ipad-duel-v2-lab.html',app:'#appStage',screen:'#charScreen:not(.hidden)',create:'#createBtn',scene:'game',roomRoot:'brawl_v2_duel_rooms',protocol:31},
 {mode:'2vs2',file:'online/ipad-squad-v2-lab.html',app:'#app',screen:'#lobbyScreen:not(.hidden)',create:'#createBtn',scene:'game',roomRoot:'brawl_v2_squad_rooms',protocol:3012}
];
(async()=>{
 const browser=await webkit.launch({headless:true});
 try{
  for(const config of modes)for(const policy of ['allow-scripts','allow-scripts allow-same-origin']){
   const html=fs.readFileSync(path.join(root,config.file),'utf8'),scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)];
   assert(scripts.length>=2);
   scripts.forEach((m,i)=>{if(m[1].trim())new vm.Script(m[1],{filename:config.file+'#'+i});});
   assert(html.includes(config.roomRoot),'online rooms isolated from legacy');
   assert(html.includes('PROTOCOL='+config.protocol)||html.includes('PROTOCOL = '+config.protocol),'version must be separate');
   assert(!/OFFLINE_ONLY_NO_REMOTE_DATABASE/.test(html),'online adapter must not be stubbed');
   assert(!html.includes('new Audio(')&&!html.includes('AudioContext('),'silent by design');
   assert(html.includes('await ensureFirebase();')||html.includes('await ensureDB();'),'do not race async Firebase loading');
   const ctx=await browser.newContext({viewport:{width:1024,height:620},isMobile:true,hasTouch:true,deviceScaleFactor:2,locale:'ja-JP'});
   const page=await ctx.newPage(),errors=[],remote=[];
   page.on('pageerror',e=>errors.push(e.message));
   page.on('request',r=>{if(/^https?:/.test(r.url()))remote.push(r.url());});
   try{
    await page.setContent('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0"></body></html>');
    await page.evaluate(({src,policy})=>{const f=document.createElement('iframe');f.setAttribute('sandbox',policy);f.srcdoc=src;f.style.cssText='position:fixed;inset:0;width:100%;height:100%;border:0';document.body.appendChild(f);},{src:html,policy});
    const f=page.frameLocator('iframe');
    await f.locator('#soloBtn').waitFor({timeout:15000});
    assert(await f.locator(config.create).isVisible(),'new friend room must be visible');
    assert(await f.locator('#onlineDbInput').count()===1,'test-only Firebase URL field');
    await f.locator(config.create).tap({timeout:10000});
    await page.waitForTimeout(220);
    const status=await f.locator(config.mode==='1vs1'?'#lobbyStatus':'#homeStatus').innerText();
    assert.match(status,/Firebase|接続|URL|データベース|ルーム作成/,'absent endpoint must fail closed, '+status);
    assert.deepEqual(remote,[],'Do not connect anywhere before explicit endpoint supplied');
    await f.locator('#soloBtn').tap({timeout:12000});
    await f.locator(config.screen).waitFor({timeout:12000});
    await f.locator('#readyBtn').tap({timeout:12000});
    await f.locator(config.app+'[data-scene="'+config.scene+'"]').waitFor({timeout:20000});
    await page.waitForTimeout(450);
    assert.deepEqual(errors,[],'online-ready version should retain BOT engine: '+JSON.stringify(errors));
    console.log('PASS online v2 '+config.mode+' ['+policy+'] : offline BOT match starts; online room accessible; missing backend rejects safely');
   }finally{await ctx.close();}
  }
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
