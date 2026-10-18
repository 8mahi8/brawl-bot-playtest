// Real Safari/WebKit offline playable Tactical Draft smoke (no Firebase/cloud).
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {webkit}=require('playwright-core');
const root=path.resolve(__dirname,'..');
const html=fs.readFileSync(path.join(root,'online/draft-duel-lab.html'),'utf8');
assert(html.includes('TACTICAL DRAFT')&&html.includes('window.__brawlDraftQA'));
assert(!html.includes('BRAWL_DRAFT_1vs1.html'),'lab HTML is not a public release');
const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)];
assert(scripts.length>=1,'offline standalone HTML contains inline JS');
scripts.forEach((m,i)=>{if(m[1].trim())new vm.Script(m[1],{filename:'draft-duel-lab.html#'+i});});
const run=async()=>{
 const browser=await webkit.launch({headless:true});
 try{
  const context=await browser.newContext({viewport:{width:1024,height:650},isMobile:true,hasTouch:true,deviceScaleFactor:1,locale:'ja-JP'});
  try{
   const page=await context.newPage(),errors=[],remote=[];
   page.on('pageerror',e=>errors.push(e.message));
   page.on('request',r=>{if(/^https?:/.test(r.url()))remote.push(r.url());});
   await page.setContent('<!doctype html><html><body style="margin:0"></body></html>');
   await page.evaluate(src=>{
    const frame=document.createElement('iframe');
    frame.setAttribute('sandbox','allow-scripts');
    frame.style.cssText='position:fixed;inset:0;width:100%;height:100%;border:0';
    frame.srcdoc=src;document.body.append(frame);
   },html);
   const f=page.frameLocator('iframe'),qa=()=>f.locator('body').evaluate(()=>window.__brawlDraftQA());
   await f.locator('#soloBtn').waitFor({timeout:15000});
   assert(await f.locator('#createBtn').isHidden(),'offline lab must not expose an online room');
   assert(await f.locator('#openJoinPanel').isHidden(),'offline lab must not expose online join');
   await f.locator('#soloBtn').tap();
   await f.locator('#readyBtn').waitFor({timeout:15000});
   await f.locator('#readyBtn').tap();
   await f.locator('#appStage[data-scene="game"]').waitFor({timeout:15000});
   const start=await qa();
   assert.equal(start.round,1);assert.deepEqual(start.owned,{host:[],guest:[]});
   async function forceRound(winner,expectedRound){
    await f.locator('body').evaluate(async (_element,{winner})=>{
      const end=Date.now()+4500;
      while(Date.now()<end){
       if(window.__brawlDraftQA()?.forceKO(winner))return;
       await new Promise(resolve=>setTimeout(resolve,50));
      }
      throw Error('KO could not be forced for draft UI regression');
    },{winner});
    await f.locator('#draftOverlay:not(.hidden)').waitFor({timeout:9000});
    const s=await qa();
    assert.equal(s.round,expectedRound);
    assert.equal(s.winner,winner);
    assert.equal(s.phase,'round_end');
    assert.equal(s.offered.length,4);
    assert.equal(s.pick,winner,'winning side must pick first');
    if(winner==='guest'){
     await f.locator('#draftOverlay button[data-draft-id]:not([disabled])').first().waitFor({timeout:7000});
    }
    const current=await qa();
    assert.equal(current.pick,'host','BOT must select first if it won');
    const candidate=f.locator('#draftOverlay button[data-draft-id]:not([disabled])').first();
    await candidate.tap({timeout:8000});
    await f.locator('#draftOverlay').waitFor({state:'hidden',timeout:9000});
    await f.locator('#appStage[data-scene="game"]').waitFor({timeout:9000});
    const next=await qa();
    assert.equal(next.round,expectedRound+1);
    assert.equal(next.owned.host.length,Math.min(expectedRound,3));
    assert.equal(next.owned.guest.length,Math.min(expectedRound,3));
    return next;
   }
   await forceRound('host',1);
   await forceRound('guest',2);
   await forceRound('host',3);
   // At cap, fourth winner-first selection exposes a replacement drop-down.
   await f.locator('body').evaluate(async ()=>{
    const end=Date.now()+4500;
    while(Date.now()<end){
     if(window.__brawlDraftQA()?.forceKO('guest'))return;
     await new Promise(resolve=>setTimeout(resolve,50));
    }
    throw Error('could not KO in round 4');
   });
   await f.locator('#draftOverlay button[data-draft-id]:not([disabled])').first().waitFor({timeout:7000});
   assert(await f.locator('#draftReplace').count()===1,'player must choose replacement at 3-card limit');
   await f.locator('#draftOverlay button[data-draft-id]:not([disabled])').first().tap();
   await f.locator('#draftOverlay').waitFor({state:'hidden',timeout:8000});
   const beforeFinal=await qa();
   assert.equal(beforeFinal.round,5);
   assert.equal(beforeFinal.owned.host.length,3,'no fourth slot may be added');
   assert.equal(beforeFinal.owned.guest.length,3,'BOT must replace instead of accumulating a fourth slot');
   await f.locator('body').evaluate(async ()=>{
    const end=Date.now()+4500;
    while(Date.now()<end){
     if(window.__brawlDraftQA()?.forceKO('host'))return;
     await new Promise(resolve=>setTimeout(resolve,50));
    }
    throw Error('could not KO in final');
   });
   await f.locator('#appStage[data-scene="end"]').waitFor({timeout:8000});
   const finish=await qa();
   assert.equal(finish.round,5);assert.equal(finish.phase,'match_end');
   assert.equal(finish.scores.host,3);assert.equal(finish.scores.guest,2);
   assert.equal(await f.locator('#draftOverlay:not(.hidden)').count(),0,'no draft occurs after match decided');
   assert.deepEqual(remote,[],'offline BOT draft makes zero remote requests');
   assert.deepEqual(errors,[],'WebKit runtime must produce zero page errors');
   console.log('PASS Safari/WebKit draft BOT: four cumulative winner-first/loser-first picks, inventory replacement, best-of-5 victory, no cloud connections');
  }finally{await context.close();}
 }finally{await browser.close();}
};
run().catch(e=>{console.error(e);process.exitCode=1;});
