// Real 2-client Safari/WebKit draft round/pick state over LOCAL Firebase RTDB.
'use strict';
const fs=require('node:fs'),http=require('node:http'),assert=require('node:assert/strict'),path=require('node:path');
const {webkit}=require('playwright-core');
if(!/^(127\.0\.0\.1|localhost):9000$/.test(process.env.FIREBASE_DATABASE_EMULATOR_HOST||''))
  throw Error('LOCAL Firebase emulator required; never run against cloud.');
const root=path.resolve(__dirname,'..');
const html=fs.readFileSync(path.join(root,'online/draft-duel-online-lab.html'),'utf8');
const sdk=path.join(root,'artifacts/firebase-sdk'),port=8871;
const server=http.createServer((req,res)=>{
 if(req.url!=='/draft'){res.writeHead(404);res.end();return;}
 res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});res.end(html);
});
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function browserClient(browser,name){
 const context=await browser.newContext({viewport:{width:1024,height:650},isMobile:true,hasTouch:true,locale:'ja-JP'});
 const page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(String(e.message)));
 page.on('console',m=>{if(m.type()==='error')errors.push(m.text().slice(0,180));});
 await page.route('https://www.gstatic.com/firebasejs/10.8.0/*',async route=>{
  const name=route.request().url().split('/').pop();
  if(!['firebase-app-compat.js','firebase-database-compat.js'].includes(name))return route.abort();
  return route.fulfill({status:200,contentType:'application/javascript',
    body:fs.readFileSync(path.join(sdk,name))});
 });
 await page.goto('http://127.0.0.1:'+port+'/draft',{waitUntil:'load'});
 await page.waitForFunction(()=>typeof window.__brawlV29QA==='function');
 return {context,page,errors,name};
}
const qa=p=>p.evaluate(()=>window.__brawlV29QA());
async function waitPhase(p,phase){
 await p.waitForFunction(phase=>window.__brawlV29QA?.()?.game?.phase===phase,phase,{timeout:16000});
}
async function run(){
 await new Promise(resolve=>server.listen(port,'127.0.0.1',resolve));
 const browser=await webkit.launch({headless:true});
 const clients=[];
 try{
  clients.push(await browserClient(browser,'host'),await browserClient(browser,'guest'));
  const host=clients[0].page,guest=clients[1].page;
  assert(await host.locator('#soloBtn').isHidden(),'offline BOT hidden');
  await host.locator('#createBtn').click();
  await host.waitForFunction(()=>/^\d{5}$/.test(window.__brawlV29QA?.()?.roomId||''),null,{timeout:13000});
  const code=(await qa(host)).roomId;
  await guest.locator('#openJoinPanel').click();
  await guest.locator('#roomInput').fill(code);
  await guest.locator('#joinBtn').click();
  await guest.waitForFunction(()=>window.__brawlV29QA?.()?.roomId!==''&&window.__brawlV29QA?.()?.role==='guest',null,{timeout:13000});
  await host.locator('#readyBtn').click();
  await guest.locator('#readyBtn').click();
  await Promise.all([waitPhase(host,'playing'),waitPhase(guest,'playing')]);
  const start=await Promise.all([qa(host),qa(guest)]);
  assert(start.every(s=>s.protocol===1031&&s.game.round===1&&s.game.draft.owned.host.length===0));
  const victories={host:0,guest:0};
  for(let round=1;round<=4;round++){
    const winner=round%2?'host':'guest',loser=winner==='host'?'guest':'host';
    victories[winner]++;
    // Deliberately force a KO result through the LOCAL test database.
    // This validates two-browser draft synchronization, not actual bullet hit-rate.
    await host.evaluate(w=>{
      const state=window.__brawlV29QA(),g=state.game;
      g.scores[w]++;g.loser=w==='host'?'guest':'host';g.phase='round_end';
      g.hp[g.loser]=0;
      return window.firebase.database().ref('roomsDraft1v1/'+state.roomId+'/game').set(g);
    },winner);
    await Promise.all([waitPhase(host,'draft'),waitPhase(guest,'draft')]);
    const before=await Promise.all([qa(host),qa(guest)]);
    assert.equal(before[0].game.draft.winner,winner);
    assert.equal(before[1].game.draft.order[0],winner);
    assert.equal(before[0].game.draft.offered.length,4);
    const first=winner==='host'?host:guest,second=winner==='host'?guest:host;
    assert.equal(await second.locator('#onlineDraftOverlay button[data-net-draft]:not([disabled])').count(),0,'loser cannot pick first');
    if(round===4)assert.equal(await first.locator('#onlineDraftReplace').count(),1,'3-card swap control');
    await first.locator('#onlineDraftOverlay button[data-net-draft]:not([disabled])').first().click();
    await second.locator('#onlineDraftOverlay button[data-net-draft]:not([disabled])').first().waitFor({timeout:9000});
    await second.locator('#onlineDraftOverlay button[data-net-draft]:not([disabled])').first().click();
    await Promise.all([waitPhase(host,'round_end'),waitPhase(guest,'round_end')]);
    const selected=await qa(host);
    assert(selected.game.draft.complete,'two picks complete');
    assert.equal(selected.game.draft.taken.length,2);
    assert(selected.game.draft.owned.host.length===Math.min(round,3));
    assert(selected.game.draft.owned.guest.length===Math.min(round,3));
    await Promise.all([host.waitForFunction(r=>window.__brawlV29QA?.()?.game?.round===r&&window.__brawlV29QA?.()?.game?.phase==='playing',round+1,{timeout:14000}),
      guest.waitForFunction(r=>window.__brawlV29QA?.()?.game?.round===r&&window.__brawlV29QA?.()?.game?.phase==='playing',round+1,{timeout:14000})]);
  }
  await host.evaluate(()=>{
    const state=window.__brawlV29QA(),g=state.game;
    g.scores.host=3;g.scores.guest=2;g.loser='guest';g.phase='match_end';
    return window.firebase.database().ref('roomsDraft1v1/'+state.roomId+'/game').set(g);
  });
  await Promise.all([waitPhase(host,'match_end'),waitPhase(guest,'match_end')]);
  assert.equal(await host.locator('#onlineDraftOverlay:not(.hidden)').count(),0,'no draft after victory');
  assert.equal((await qa(host)).game.scores.host,3);
  for(const c of clients)assert.deepEqual(c.errors,[],'no page errors for '+c.name);
  console.log('PASS WebKit two REAL clients / local Firebase: room, ready, 4 winner-first picks, cumulative 3-card replacement, 3-win ending');
 }finally{
  for(const c of clients)await c.context.close();
  await browser.close();await new Promise(resolve=>server.close(resolve));
 }
}
run().catch(e=>{console.error(e);process.exitCode=1;try{server.close();}catch(_){}});
