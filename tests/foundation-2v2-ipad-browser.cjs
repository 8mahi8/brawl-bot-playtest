// Tests KO/AREA in iPad-sized Chromium or WebKit; NOT physical school iPad Safari.
'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {webkit,chromium}=require('playwright-core');
const type=process.argv[2]==='webkit'?'webkit':'chromium',engine=type==='webkit'?webkit:chromium;
const executablePath=['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium','/usr/bin/chromium-browser'].find(fs.existsSync);
if(type==='chromium'&&!executablePath)throw Error('Chrome not installed');
const pageUrl='file://'+path.resolve(__dirname,'../foundation/2v2-ipad-safari.html');
const folder=path.resolve(__dirname,'../artifacts');fs.mkdirSync(folder,{recursive:true});
function inScreen(r,w,h,name){assert(r.x>=-2&&r.y>=-2&&r.x+r.width<=w+2&&r.y+r.height<=h+2,'out of viewport '+name+JSON.stringify(r));}
async function play(browser,mode){
 const ctx=await browser.newContext({viewport:{width:1024,height:768},deviceScaleFactor:2,isMobile:true,hasTouch:true});
 const page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 try{
  await page.goto(pageUrl,{waitUntil:'load'});
  assert(await page.locator('#soloBtn').isVisible(),'BOT start without login');
  await page.locator('#soloBtn').tap();
  await page.waitForFunction(()=>window.__brawlV3QA?.().scene==='lobby',{timeout:11000});
  await page.locator('#botFreeze').check();
  if(mode==='area')await page.locator('#modePick [data-mode="area"]').tap();
  await page.locator('#readyBtn').tap();
  await page.waitForFunction(mode=>{const q=window.__brawlV3QA?.();return q?.game==='playing'&&q.mode===mode&&q.combat.clock.t>=220;},mode,{timeout:22000});
  const inspect=()=>page.evaluate(()=>{
   const q=window.__brawlV3QA(),rect=el=>{const r=document.getElementById(el).getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height};};
   return {q,app:rect('app'),canvas:rect('arena'),buttons:['gadAction','ultAction'].map(id=>({id,rect:rect(id)})),width:innerWidth,height:innerHeight,dvh:CSS.supports('height','100dvh')};
  });
  let v=await inspect();assert(v.q.ipadReady&&v.q.teamGuardLab);
  assert(v.dvh,'WebKit supports dvh');
  assert(Math.abs(v.app.height-v.height)<4,'full height visible');
  assert(Math.abs(v.canvas.height-v.height)<4,'canvas full height');
  for(const b of v.buttons)inScreen(b.rect,v.width,v.height,b.id);
  const seq=v.q.stats[v.q.myId].lastActionSeq,arena=await page.locator('#arena').boundingBox();
  await page.touchscreen.tap(arena.x+arena.width*.64,arena.y+arena.height*.7);
  await page.waitForFunction(old=>{const q=window.__brawlV3QA?.();return q?.stats?.[q.myId]?.lastActionSeq>old;},seq,{timeout:7500});
  v=await inspect();const gadgets=v.q.stats[v.q.myId].gadgets;
  await page.locator('#gadAction').tap();
  await page.waitForFunction(gad=>{const q=window.__brawlV3QA?.();return q?.stats?.[q.myId]?.gadgets<gad;},gadgets,{timeout:7000});
  assert.equal(errors.length,0,'JS exceptions '+errors.join(' | '));
  await page.screenshot({path:path.join(folder,'ipad-'+type+'-'+mode+'-landscape.png'),fullPage:true});
  await page.setViewportSize({width:768,height:1024});await page.waitForTimeout(260);v=await inspect();
  assert(Math.abs(v.app.height-v.height)<4,'portrait no crop');
  for(const b of v.buttons)inScreen(b.rect,v.width,v.height,'portrait '+b.id);
  await page.screenshot({path:path.join(folder,'ipad-'+type+'-'+mode+'-portrait.png'),fullPage:true});
  assert.equal(errors.length,0,'JS errors after rotation '+errors.join(' | '));
  console.log('PASS '+type+' '+mode+' iPad landscape/portrait: touch shooting, GAD, viewport, controls');
 }catch(e){await page.screenshot({path:path.join(folder,'ipad-'+type+'-'+mode+'-error.png'),fullPage:true}).catch(()=>{});throw Error(type+' '+mode+': '+(e.stack||e)+' JS:'+errors.join(' | '));}
 finally{await ctx.close();}
}
(async()=>{const b=await engine.launch(type==='webkit'?{headless:true}:{headless:true,executablePath,args:['--no-sandbox','--disable-dev-shm-usage']});try{await play(b,'ko');await play(b,'area');}finally{await b.close()}})().catch(e=>{console.error(e);process.exitCode=1;});
