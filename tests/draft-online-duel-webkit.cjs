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
  assert(start.every(s=>s.protocol===1031&&s.game.round===1&&(s.game.draft?.owned?.host||[]).length===0));
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
  // Isolated emulator: enable recoil on host after all four legit draft rounds,
  // then fire a REAL client shot and observe local motion + RTDB peer position.
  await host.evaluate(async()=>{
    const s=window.__brawlV29QA();
    await window.firebase.database().ref('roomsDraft1v1/'+s.roomId+'/game').transaction(g=>{
      if(g?.phase!=='playing'||g.round!==5)return;
      g.draft.owned.host=['recoil_shot','split_round','delayed_blast'];
      return g;
    },undefined,false);
  });
  await host.waitForFunction(()=>window.__brawlV29QA()?.game?.draft?.owned?.host?.includes('recoil_shot'),null,{timeout:10000});
  await host.waitForFunction(()=>window.__brawlDraftFireReadyQA?.()?.isPlaying,
    null,{timeout:15000});
  const beforeRecoil=(await qa(host)).local.x;
  assert.equal(await host.evaluate(()=>window.__brawlDraftFireQA(Math.PI)),true,'online host fires normal shot');
  const afterRecoil=(await qa(host)).local.x;
  assert(afterRecoil-beforeRecoil>=50&&afterRecoil-beforeRecoil<=64,
    'online recoil is one collision-safe ~60 unit displacement per ammo action');
  await guest.waitForFunction(x=>window.__brawlV29QA()?.remote?.targetX>x+45,beforeRecoil,{timeout:10000});
  // A quick second shot inside the 1.2 second recoil CD must not add another displacement.
  const secondBefore=(await qa(host)).local.x;
  await host.evaluate(()=>window.__brawlDraftFireQA(Math.PI));
  const secondAfter=(await qa(host)).local.x;
  assert(Math.abs(secondAfter-secondBefore)<5,'recoil cannot multiply within cooldown');

  // Real 1vs1 center-bullet split from Tank/Gunner volley (other pellets unchanged).
  assert.equal(await host.evaluate(()=>window.__brawlDraftMoveQA(150,300)),true);
  // Earlier volleys can still be travelling while the next shot is being prepared.
  // Exhaust previous projectiles first, otherwise their delayed split inflates this
  // shot's delta even though the engine itself splits each center only once.
  await host.waitForFunction(()=>window.__brawlV29QA?.()?.shots?.length===0,null,{timeout:10000});
  await host.waitForFunction(()=>window.__brawlDraftFireReadyQA?.()?.ammo>0,null,{timeout:11000});
  const splitBefore=await host.evaluate(()=>window.__brawlDraftSplitCountQA());
  assert.equal(await host.evaluate(()=>window.__brawlDraftFireQA(0)),true);
  await host.waitForFunction(before=>window.__brawlDraftSplitCountQA?.()>before,
    splitBefore,{timeout:9000});
  assert.equal(await host.evaluate(()=>window.__brawlDraftSplitCountQA()),splitBefore+1,
    'this volley adds exactly one center split; earlier volley splits are already counted');

  // Reposition a real guest client into the same unobstructed firing lane.
  // The host alone schedules damage and the 700ms follow-up blast in the same RTDB state.
  assert.equal(await guest.evaluate(()=>window.__brawlDraftMoveQA(315,300)),true);
  await host.waitForFunction(()=>Math.abs((window.__brawlV29QA()?.remote?.targetX||0)-315)<5,
    null,{timeout:12000});
  assert.equal(await host.evaluate(()=>window.__brawlDraftMoveQA(150,300)),true);
  await host.waitForFunction(()=>window.__brawlDraftFireReadyQA?.()?.ammo>0,null,{timeout:11000});
  assert.equal(await host.evaluate(()=>window.__brawlDraftFireQA(0)),true,'actual host shot into positioned guest');
  await host.waitForFunction(()=>Object.keys(window.__brawlV29QA()?.game?.draft?.blastUsed||{}).length>=1,
    null,{timeout:13000});
  const triggered=(await qa(host)).game;
  assert.equal(Object.keys(triggered.draft.blastUsed).length,1,
    'multiple Tank/Gunner bullets schedule only one delayed blast per fireActionId');
  await host.waitForFunction(()=>Object.keys(window.__brawlV29QA()?.game?.draftBlasts||{}).length===0,
    null,{timeout:10000});
  assert((await qa(host)).game.hp.guest<triggered.hp.guest,
    '700ms delayed blast executes and further reduces the real guest HP');

  // Isolated 1v1 real WebKit: host fires toward the west wall at x=295.
  // Only Ricochet owners get reflections; server-issued normal/ULT stay unchanged.
  await host.evaluate(async()=>{
    const q=window.__brawlV29QA();
    await window.firebase.database().ref('roomsDraft1v1/'+q.roomId+'/game').transaction(g=>{
      if(g?.phase!=='playing'||g.round!==5)return;
      g.draft.owned.host=['ricochet','split_round','delayed_blast'];
      return g;
    },undefined,false);
  });
  await host.waitForFunction(()=>window.__brawlV29QA()?.game?.draft?.owned?.host?.includes('ricochet'),
    null,{timeout:10000});
  assert.equal(await host.evaluate(()=>window.__brawlDraftMoveQA(220,200)),true,
    'real host moves beside verified west terrain wall');
  await host.waitForFunction(()=>window.__brawlDraftFireReadyQA?.()?.ammo>0,null,{timeout:11000});
  const beforeBounce=await host.evaluate(()=>window.__brawlDraftRicochetCountQA());
  assert.equal(await host.evaluate(()=>window.__brawlDraftFireQA(0)),true,
    'real online host fires into the wall');
  await host.waitForFunction(n=>window.__brawlDraftRicochetCountQA?.()>n,
    beforeBounce,{timeout:11000});
  await host.waitForTimeout(350);
  const bounces=await host.evaluate(()=>window.__brawlDraftRicochetCountQA());
  assert(bounces>=beforeBounce+1&&bounces<=beforeBounce+5,
    'one Tank volley may reflect at most five original pellets, no recursive explosion');
  console.log('PASS 1vs1 real WebKit host ricochet: one wall bounce per normal projectile');

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
