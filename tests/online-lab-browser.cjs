// Safety gate for independent BRAWL online candidates. Never touches production Firebase.
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {chromium}=require('playwright-core');
const candidates=[
 {mode:'1vs1',p:'online/1v1-online-lab.html',qa:'__brawlV29QA',room:'rooms/',protocol:30},
 {mode:'2vs2',p:'online/2v2-online-lab.html',qa:'__brawlV3QA',room:'rooms2v2/',protocol:3011}
];
const root=path.resolve(__dirname,'..');
for(const c of candidates){
 const s=fs.readFileSync(path.join(root,c.p),'utf8');
 assert.match(s,/<!DOCTYPE html>/,'standalone HTML');
 assert.match(s,/<input id="onlineDbInput"/,'online endpoint set by tester');
 assert.match(s,/window\.BrawlOnlineConfig/,'URL validation helper');
 assert.match(s,/firebase-database-compat\.js/,'Firebase SDK lazy loading');
 assert.match(s,/https:\/\/\*\.firebaseio\.com/,'CSP allows Realtime Database');
 assert.doesNotMatch(s,/OFFLINE_ONLY_NO_REMOTE_DATABASE|BOT練習専用版: オンライン接続は無効/,'old kill-switch gone');
 assert.doesNotMatch(s,/https:\/\/mygame-df915/,'private production RTDB URL must not ship');
 assert.doesNotMatch(s,/href="\.\/[12]v[12]-/,'Google Sites owns mode navigation');
 for(const [i,m] of [...s.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].entries()){
  if(m[1].trim())new vm.Script(m[1],{filename:c.p+'#inline'+i});
 }
 console.log('PASS '+c.mode+' standalone inline JS syntax / no production RTDB URL / CSP / isolation');
}
(async()=>{
 const exe=['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium','/usr/bin/chromium-browser'].find(fs.existsSync);
 if(!exe)throw Error('Chromium not installed');
 const browser=await chromium.launch({headless:true,executablePath:exe,args:['--no-sandbox','--disable-dev-shm-usage']});
 try{
  for(const c of candidates){
   const ctx=await browser.newContext({viewport:{width:1180,height:760}});
   const page=await ctx.newPage(),errs=[],sdk=[];
   page.on('pageerror',e=>errs.push(String(e)));
   await page.route('https://www.gstatic.com/**',route=>{sdk.push(route.request().url());return route.abort();});
   await page.goto('file://'+path.join(root,c.p));
   await page.waitForFunction(key=>typeof window[key]==='function',c.qa,{timeout:13000});
   assert.equal(await page.locator('#createBtn').isVisible(),true,c.mode+' create button is clickable');
   assert.equal(await page.locator('#soloBtn').isVisible(),true,c.mode+' solo button remains present');
   assert.equal(sdk.length,0,'BOT startup must not download Firebase SDK');
   await page.locator('#createBtn').click();
   await page.waitForTimeout(150);
   const msg=await page.locator(c.mode==='1vs1'?'#lobbyStatus':'#homeStatus').innerText();
   assert.match(msg,/Firebase Realtime Database/,c.mode+' missing URL error needs guidance');
   assert.equal(sdk.length,0,'Missing configuration must not fetch SDK');
   assert.equal(errs.length,0,c.mode+' no JS page errors: '+errs.join('; '));
   await page.locator('#soloBtn').click();
   await page.waitForFunction(({mode,key})=>{
    const x=window[key]();return mode==='1vs1'?x.solo&&x.scene==='select':x.solo&&x.scene==='lobby';
   },{mode:c.mode,key:c.qa},{timeout:12000});
   assert.equal(errs.length,0,c.mode+' BOT regression: '+errs.join('; '));
   await ctx.close();
   console.log('PASS '+c.mode+' browser BOT + create/join UI + endpoint validation + no SDK before online click');
  }
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
