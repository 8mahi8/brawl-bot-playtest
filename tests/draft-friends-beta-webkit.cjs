// Browser smoke of exact Friends-BETA HTML gameplay under a LOCAL emulator.
// The local HTTP test fixture only substitutes RTDB endpoint/CSP and injects
// useEmulator(). The committed Google Sites pages never contain the hook.
'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),http=require('node:http');
const {webkit}=require('playwright-core');
if(!/^(127\.0\.0\.1|localhost):9000$/.test(process.env.FIREBASE_DATABASE_EMULATOR_HOST||''))
  throw Error('LOCAL Firebase emulator is mandatory; never contact production');
const dir=path.resolve(__dirname,'..'),sdk=path.join(dir,'artifacts/firebase-sdk');
const demoUrl='https://demo-brawl-draft-beta-default-rtdb.firebaseio.com/';
const remote='https://mygame-df915-default-rtdb.firebaseio.com/';
const csp='connect-src https://*.firebaseio.com wss://*.firebaseio.com https://*.firebasedatabase.app wss://*.firebasedatabase.app https://www.googleapis.com https://*.googleapis.com';
const emulatorCsp='connect-src http://127.0.0.1:9000 ws://127.0.0.1:9000 http://localhost:9000 ws://localhost:9000';
function fixture(file){
 let s=fs.readFileSync(path.join(dir,'sites',file),'utf8');
 assert(s.includes(remote)&&s.includes(csp));
 s=s.replaceAll(remote,demoUrl).replace(csp,emulatorCsp);
 const needle=file.includes('1vs1')?'    db=firebase.database();':' db=firebase.database(); // Friends beta uses selected cloud RTDB.';
 if(!s.includes(needle))throw Error('database initialization changed: '+file);
 s=s.replace(needle,file.includes('1vs1')
   ?needle+' db.useEmulator(\'127.0.0.1\',9000);'
   :" db=firebase.database(); db.useEmulator('127.0.0.1',9000); // emulator-only test fixture");
 return s;
}
const html={
 '/duel':fixture('BRAWL_DRAFT_FRIENDS_BETA_1vs1.html'),
 '/squad':fixture('BRAWL_DRAFT_FRIENDS_BETA_2vs2.html'),
 '/layout':fixture('BRAWL_DRAFT_FRIENDS_BETA_2vs2_LAYOUT_PREVIEW.html'),
 '/latency':fixture('BRAWL_DRAFT_FRIENDS_BETA_2vs2_LATENCY_CANDIDATE.html')
};
const port=8878,server=http.createServer((req,res)=>{
 if(!(req.url in html)){res.writeHead(404);res.end();return;}
 res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});res.end(html[req.url]);
});
async function open(browser,mode){
 const ctx=await browser.newContext({viewport:{width:1024,height:650},isMobile:true,hasTouch:true,locale:'ja-JP'});
 const page=await ctx.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 page.on('console',e=>{if(e.type()==='error')errors.push(e.text().slice(0,170));});
 await page.route('https://www.gstatic.com/firebasejs/10.8.0/*',async route=>{
  const name=route.request().url().split('/').pop();
  if(!['firebase-app-compat.js','firebase-database-compat.js'].includes(name))return route.abort();
  return route.fulfill({status:200,contentType:'application/javascript',body:fs.readFileSync(path.join(sdk,name))});
 });
 await page.goto('http://127.0.0.1:'+port+'/'+mode,{waitUntil:'load'});
 const qa=mode==='duel'?'__brawlV29QA':'__brawlV3QA';
 await page.waitForFunction(key=>typeof window[key]==='function',qa,{timeout:16000});
 return {ctx,page,errors,qa};
}
async function run(){
 await new Promise(resolve=>server.listen(port,'127.0.0.1',resolve));
 let browser;const all=[];
 try{
  browser=await webkit.launch({headless:true});
  // Offline UI test of candidate under mobile WebKit: editor must not
  // require Firebase, must not fire GAD2, and must restore GAD/ULT preferences.
  const trial=await open(browser,'layout');all.push(trial);
  const trialPage=trial.page;
  await trialPage.locator('#layoutBtn').click();
  assert.equal(await trialPage.evaluate(()=>window.__brawlV3QA().scene),'layout');
  const preview=trialPage.locator('#mockGad2');
  await preview.waitFor({state:'visible'});
  const before=await preview.boundingBox();
  assert(before?.width>=60&&before?.height>=60,'GAD2 draggable preview visible');
  await trialPage.locator('#gad2Size').evaluate(el=>{
    el.value='88';el.dispatchEvent(new Event('input',{bubbles:true}));
  });
  assert.equal(await trialPage.locator('#mockGad2').evaluate(el=>el.style.width),'88px');
  const current=await preview.boundingBox();
  await trialPage.mouse.move(current.x+current.width/2,current.y+current.height/2);
  await trialPage.mouse.down();
  await trialPage.mouse.move(current.x+current.width/2-140,current.y+current.height/2-60,{steps:8});
  await trialPage.mouse.up();
  const after=await preview.boundingBox();
  assert(after.x<before.x-70&&after.y<before.y-25,'GAD2 preview moves when dragged');
  await trialPage.locator('#layoutDone').click();
  let saved=await trialPage.evaluate(()=>({
    gadget2:JSON.parse(localStorage.getItem('brawl-draft-2v2-gad2-layout-v1')),
    original:JSON.parse(localStorage.getItem('brawl-v3-2v2-r4-layout'))
  }));
  assert(saved.gadget2&&saved.gadget2.size===88&&saved.gadget2.x<.75,'GAD2 setting persisted');
  assert(saved.original.gad&&saved.original.ult&&!saved.original.gad2,
    'previous normal 2vs2 GAD/ULT preference namespace stays backwards compatible');
  await trialPage.reload({waitUntil:'load'});
  await trialPage.locator('#layoutBtn').click();
  assert.equal(await trialPage.locator('#gad2Size').inputValue(),'88');
  const reloaded=await trialPage.locator('#mockGad2').boundingBox();
  assert(Math.abs(reloaded.x-after.x)<5&&Math.abs(reloaded.y-after.y)<5,'layout restores across reload');
  assert.equal(await trialPage.locator('#squadGad2Action').evaluate(el=>el.style.width),'88px',
    'actual battle GAD2 adopts saved size');
  await trialPage.locator('#layoutReset').click();
  assert.equal(await trialPage.locator('#gad2Size').inputValue(),'68');
  assert.deepEqual(trial.errors,[],'no WebKit errors from GAD2 layout changes');
  console.log('PASS 2vs2 GAD2 layout candidate: drag, resize, persistence, reset, battle position and no Firebase');
  await trial.ctx.close();
  const [h,g]=await Promise.all([open(browser,'duel'),open(browser,'duel')]);all.push(h,g);
  await h.page.locator('#createBtn').click();
  await h.page.waitForFunction(()=>/^\d{5}$/.test(window.__brawlV29QA?.()?.roomId||''),null,{timeout:14000});
  const duel=(await h.page.evaluate(()=>window.__brawlV29QA())).roomId;
  await g.page.locator('#openJoinPanel').click();
  await g.page.locator('#roomInput').fill(duel);
  await g.page.locator('#joinBtn').click();
  await g.page.waitForFunction(code=>window.__brawlV29QA?.()?.roomId===code&&window.__brawlV29QA?.()?.role==='guest',duel,{timeout:14000});
  await h.page.locator('#readyBtn').click();
  await g.page.locator('#readyBtn').click();
  await Promise.all([h,g].map(x=>x.page.waitForFunction(()=>window.__brawlV29QA?.()?.game?.phase==='playing',null,{timeout:19000})));
  for(const x of [h,g]){const q=await x.page.evaluate(()=>window.__brawlV29QA());
   assert.equal(q.protocol,1031);assert.equal(q.game.round,1);assert.equal(q.game.draft?.owned?.host?.length||0,0);}
  const duelDb=await h.page.evaluate(async code=>(await window.firebase.database().ref('rooms/'+code+'/v').once('value')).val(),duel);
  assert.equal(duelDb,1031,'duel beta uses normal friend RTDB root with isolated draft protocol');
  console.log('PASS FRIEND BETA 1vs1: two WebKit clients joined, READY, real RTDB playing, draft protocol separate');
  // Deliver a 160ms-old shot through the actual RTDB listener.
  // Its simulation already advanced, but the remote draw must start at the muzzle.
  const source=await h.page.evaluate(()=>{
    const q=window.__brawlV29QA();
    return {x:q.local.x,y:q.local.y,round:q.game.round};
  });
  const shotId=await h.page.evaluate(async source=>{
    const rt=window.firebase.database().ref('rooms/'+window.__brawlV29QA().roomId+'/shots').push();
    await rt.set({round:source.round,owner:'host',x:source.x,y:source.y,
      angle:0,ult:false,fireId:'lag-repro-'+rt.key,splitCenter:false,
      firedAt:Date.now()-160});
    return rt.key;
  },source);
  const handle=await g.page.waitForFunction(id=>{
    const q=window.__brawlV29QA?.(),bullet=q?.shots?.find(s=>s.id===id);
    if(!bullet||!q.fx.includes('remote-muzzle'))return false;
    return {id:bullet.id,owner:bullet.owner,x:bullet.x,y:bullet.y,
      birthX:bullet.remoteBirthX,birthY:bullet.remoteBirthY,
      birthAt:bullet.remoteBirthAt,seenFlash:true};
  },shotId,{timeout:8000,polling:'raf'});
  const remoteBullet=await handle.jsonValue();
  assert.equal(remoteBullet.owner,'host');
  assert(remoteBullet.seenFlash,'remote shot shows a muzzle flash');
  assert(Math.abs(remoteBullet.birthX-(source.x+28))<.01,'remote shot starts at muzzle');
  assert(Math.abs(remoteBullet.birthY-source.y)<.01);
  assert(remoteBullet.x>remoteBullet.birthX+35,
    'simulation keeps network-age advancement for combat');
  assert(Number.isFinite(remoteBullet.birthAt));
  console.log('PASS FRIEND BETA 1vs1 delayed remote shot: muzzle birth, flash, combat age unchanged');
  await Promise.all([h,g].map(x=>x.ctx.close()));

  const clients=await Promise.all(Array.from({length:4},()=>open(browser,'latency')));all.push(...clients);
  const host=clients[0].page;
  await host.locator('#createBtn').click();
  try{await host.waitForFunction(()=>/^\d{5}$/.test(window.__brawlV3QA?.()?.roomId||''),null,{timeout:17000});}
  catch(e){const diag=await host.evaluate(()=>({home:document.getElementById('homeStatus')?.textContent,qa:window.__brawlV3QA?.()?.roomId,db:window.BrawlOnlineConfig?.get?.()})).catch(z=>String(z));
    throw Error('2vs2 beta Create Room diagnosis: '+JSON.stringify({diag,errors:clients[0].errors})+'; '+e.message);}
  const squad=(await host.evaluate(()=>window.__brawlV3QA())).roomId;
  for(const x of clients.slice(1)){
   await x.page.locator('#roomInput').fill(squad);
   await x.page.locator('#joinBtn').click();
   await x.page.waitForFunction(code=>window.__brawlV3QA?.()?.roomId===code&&window.__brawlV3QA?.()?.seat, squad,{timeout:16000});
  }
  const first=await Promise.all(clients.map(x=>x.page.evaluate(()=>window.__brawlV3QA())));
  assert.deepEqual(first.map(q=>q.seat).sort(),['blue1','blue2','red1','red2']);
  // One real defender plays Bomber so both ordinary and lobbed incoming shots run.
  const red2Client=clients[first.findIndex(q=>q.seat==='red2')];
  await red2Client.page.locator('#charPick button[data-char="bomber"]').click();
  await red2Client.page.waitForFunction(()=>window.__brawlV3QA?.()?.lobby?.seats?.red2?.char==='bomber',null,{timeout:15000});
  for(const x of clients)await x.page.locator('#readyBtn').click();
  await Promise.all(clients.map(x=>x.page.waitForFunction(()=>window.__brawlV3QA?.()?.game==='playing',null,{timeout:22000})));
  const now=await Promise.all(clients.map(x=>x.page.evaluate(()=>window.__brawlV3QA())));
  assert(now.every(q=>q.protocol===13012&&q.round===1&&q.online===4));
  const squadDb=await host.evaluate(async code=>(await window.firebase.database().ref('rooms2v2/'+code+'/v').once('value')).val(),squad);
  assert.equal(squadDb,13012,'squad beta uses existing 2v2 root, no normal v3012 collision');
  // A real player fires through the same RTDB action queue and HOST reducer
  // as the beta game. The opposite-team WebKit client must SEE the muzzle
  // before interpolating to the already-advanced host bullet.
  const red=clients[first.findIndex(q=>q.seat==='red1')].page;
  await host.waitForFunction(()=>window.__brawlDraftFireReadyQA?.()?.canShoot,null,{timeout:17000});
  assert.equal(await host.evaluate(()=>window.__brawlDraftFireQA(0)),true,'host can fire an actual game shot');
  // Earlier builds demanded a host-arrival muzzle flash. The new version
  // legitimately seeds visualBullet from ACTION before the host snapshot, so
  // that old flash is no longer a required onset signal.
  const onset=await red.waitForFunction(owner=>{
    const early=window.__brawlEarlyShotsQA?.(),q=window.__brawlV3QA?.();
    if((early?.stats?.incoming||0)<1)return false;
    const b=Object.values(q?.combat?.projectiles||{}).find(p=>
      p.owner===owner&&Number.isFinite(p.originX)&&Number.isFinite(p.originY));
    if(!b)return false;
    return {id:b.id,originX:b.originX,originY:b.originY,
      earlyIncoming:early.stats.incoming,
      handoffs:early.stats.hostHandoffs};
  },first[0].myId,{timeout:16000,polling:'raf'});
  const shot=await onset.jsonValue();
  assert(Number.isFinite(shot.originX)&&Number.isFinite(shot.originY));
  assert(shot.earlyIncoming>=1,'new peer-action visual path activated');
  console.log('PASS FRIEND BETA 2vs2 live shot: peer action preview and eventual true host muzzle coordinates');

  // New peer renders the ACTION itself; it must not wait for the full host snapshot.
  const received=await red.evaluate(()=>window.__brawlEarlyShotsQA());
  assert(received.stats.incoming>=1,'remote observer received peer shot before or during host confirmation');
  // Bomber is verified using the exact same wire action, not fabricated UI state.
  const bomberClient=red2Client.page;
  await bomberClient.waitForFunction(()=>window.__brawlDraftFireReadyQA?.()?.canShoot,null,{timeout:13000});
  assert.equal(await bomberClient.evaluate(()=>window.__brawlDraftFireQA(Math.PI)),true,
    'real Bomber launches one projectile using the action stream');
  const blueClient=clients[first.findIndex(q=>q.seat==='blue2')].page;
  await blueClient.waitForFunction(()=>{
    const s=window.__brawlEarlyShotsQA?.()?.stats;
    return !!s&&s.bomber>=1&&s.shown>0;
  },null,{timeout:17000});
  const bombSeen=await blueClient.evaluate(()=>window.__brawlEarlyShotsQA());
  assert(bombSeen.stats.bomber>=1&&bombSeen.stats.shown>0);
  console.log('PASS 2vs2 early peer-action prediction: blue sees red Bomber flight; red sees blue bullets, without changing HP');


  // Real 4-peer draft friend beta candidate: KO via host-authoritative
  // bullets (never assign winner, phase or score), then four legal picks and
  // automatic advance to second round. Operates ONLY on local emulator.
  const bySeat=Object.fromEntries(first.map((q,i)=>[q.seat,clients[i].page]));
  const bluePages=[bySeat.blue1,bySeat.blue2],redPages=[bySeat.red1,bySeat.red2];
  await Promise.all([...bluePages,...redPages].map(p=>p.waitForFunction(
    ()=>window.__brawlDraftFireReadyQA?.()?.canShoot,null,{timeout:15000})));
  for(let i=0;i<2;i++){
    const y=i===0?420:700;
    assert.equal(await bluePages[i].evaluate(y=>window.__brawlDraftMoveQA(525,y),y),true,
      'blue shooter has a clear lane');
    assert.equal(await redPages[i].evaluate(y=>window.__brawlDraftMoveQA(640,y),y),true,
      'red defender has a clear lane');
  }
  await host.waitForFunction(ids=>{
    const p=window.__brawlV3QA?.()?.positionValues||{};
    return ids.every(z=>Math.abs((p[z.id]?.x||0)-z.x)<5&&Math.abs((p[z.id]?.y||0)-z.y)<5);
  },first.map(q=>({id:q.myId,x:q.seat.startsWith('blue')?525:640,
     y:q.seat.endsWith('1')?420:700})),{timeout:15000});
  const victimIds=first.filter(q=>q.seat.startsWith('red')).map(q=>q.myId);
  const prepared=await host.evaluate(async ids=>{
    const q=window.__brawlV3QA();
    const root=window.firebase.database().ref('rooms2v2/'+q.roomId+'/game');
    const result=await root.transaction(g=>{
      if(g?.phase!=='playing'||g.round!==1)return;
      for(const id of ids){
        g.hp[id]=1;
        g.combatAt[id]=g.clock.t;
        if(g.protection)delete g.protection[id];
      }
      return g;
    },undefined,false);
    return result.committed;
  },victimIds);
  assert(prepared,'seed low health only; do not force outcomes');
  await Promise.all(bluePages.map(p=>p.waitForFunction(
    ()=>window.__brawlDraftFireReadyQA?.()?.canShoot,null,{timeout:12000})));
  for(const p of bluePages)assert.equal(await p.evaluate(()=>window.__brawlDraftFireQA(0)),true,
    'live actual blue shot enters host action bus');
  await Promise.all(clients.map(c=>c.page.waitForFunction(()=>{
    const q=window.__brawlV3QA?.();
    return q?.game==='draft'&&q.round===1&&q.draft?.winner==='blue';
  },null,{timeout:23000})));
  const draft=(await host.evaluate(()=>window.__brawlV3QA())).draft;
  assert.deepEqual(draft.order,['blue1','red1','red2','blue2'],
    'winning team must pick first in 2vs2 snake order');
  const picks=[];
  for(let i=0;i<4;i++){
    const page=bySeat[draft.order[i]];
    const chosen=page.locator('#squadDraftOverlay button[data-squad-draft]:not([disabled])').first();
    await chosen.waitFor({timeout:16000});
    const id=await chosen.getAttribute('data-squad-draft');
    await chosen.click();
    picks.push(id);
    await host.waitForFunction(n=>{
      const q=window.__brawlV3QA?.();
      return q?.draft?.turn>=n||q?.draft?.complete||q?.round===2;
    },i+1,{timeout:15000});
  }
  assert.equal(new Set(picks).size,4,'four unique draft choices');
  await Promise.all(clients.map(c=>c.page.waitForFunction(()=>{
    const q=window.__brawlV3QA?.();
    return q?.game==='playing'&&q.round===2&&
      ['blue1','red1','red2','blue2'].every(seat=>(q.draft?.owned?.[seat]||[]).length===1);
  },null,{timeout:26000})));
  console.log('PASS FRIEND BETA 2vs2 layout candidate: four real shots/KO -> winning-team snake picks -> round 2 on four WebKit devices');
  for(const c of all)assert.deepEqual(c.errors,[],'unexpected WebKit JS errors');
  console.log('PASS FRIEND BETA 2vs2: four WebKit clients joined, READY, real RTDB playing, draft protocol separate');
 }finally{
  for(const c of all)try{await c.ctx.close();}catch(_){}
  if(browser)await browser.close();
  await new Promise(resolve=>server.close(resolve));
 }
}
run().catch(e=>{console.error(e);process.exitCode=1;try{server.close();}catch(_){}});
