// Four ACTUAL Safari/WebKit clients on a LOCAL RTDB emulator. Never hits live cloud.
'use strict';
const fs=require('node:fs'),http=require('node:http'),path=require('node:path'),assert=require('node:assert/strict');
const {webkit}=require('playwright-core');
if(!/^(127\.0\.0\.1|localhost):9000$/.test(process.env.FIREBASE_DATABASE_EMULATOR_HOST||''))
 throw Error('Requires loopback Firebase emulator');
const root=path.resolve(__dirname,'..'),src=fs.readFileSync(path.join(root,'online/draft-squad-online-lab.html'),'utf8');
const sdk=path.join(root,'artifacts/firebase-sdk'),port=8872,clients=[];
const server=http.createServer((req,res)=>{
 if(req.url!=='/squad'){res.writeHead(404);res.end();return;}
 res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});res.end(src);
});
async function client(browser,index){
 const ctx=await browser.newContext({viewport:{width:1024,height:650},isMobile:true,hasTouch:true,deviceScaleFactor:1,locale:'ja-JP'});
 const page=await ctx.newPage(),errors=[];
 page.on('pageerror',e=>errors.push('PAGE '+e.message));
 page.on('console',m=>{if(m.type()==='error')errors.push('CONSOLE '+m.text().slice(0,250));});
 await page.route('https://www.gstatic.com/firebasejs/10.8.0/*',async route=>{
  const name=route.request().url().split('/').pop();
  if(!['firebase-app-compat.js','firebase-database-compat.js'].includes(name))return route.abort();
  return route.fulfill({status:200,contentType:'application/javascript',body:fs.readFileSync(path.join(sdk,name))});
 });
 await page.goto('http://127.0.0.1:'+port+'/squad');
 await page.waitForFunction(()=>typeof window.__brawlV3QA==='function',null,{timeout:18000});
 return {ctx,page,index,errors};
}
const get=page=>page.evaluate(()=>window.__brawlV3QA());
async function wait(p,phase){
 await p.waitForFunction(s=>window.__brawlV3QA?.()?.game===s,phase,{timeout:22000});
}
async function forcedKO(page,winner,scores,round){
 await page.evaluate(({winner,scores,round})=>{
  const state=window.__brawlV3QA();
  return window.firebase.database().ref('roomsDraft2v2/'+state.roomId+'/game').transaction(g=>{
   if(g?.phase!=='playing'||g.round!==round)return;
   g.phase='round_end';g.winner=winner;g.scores={blue:scores.blue,red:scores.red};
   g.endedAt=Date.now();return g;
  },undefined,false);
 },{winner,scores,round});
}
async function run(){
 await new Promise(resolve=>server.listen(port,'127.0.0.1',resolve));
 let browser;
 try{
  browser=await webkit.launch({headless:true});
  for(let i=0;i<4;i++)clients.push(await client(browser,i));
  const [host,...others]=clients.map(c=>c.page);
  assert(await host.locator('#soloBtn').isHidden());
  await host.locator('#createBtn').click();
  await host.waitForFunction(()=>/^\d{5}$/.test(window.__brawlV3QA?.()?.roomId||''),null,{timeout:18000});
  const code=(await get(host)).roomId;
  for(const p of others){
   await p.locator('#roomInput').fill(code);
   await p.locator('#joinBtn').click();
   await p.waitForFunction(code=>window.__brawlV3QA?.()?.roomId===code&&window.__brawlV3QA?.()?.seat!==null,code,{timeout:16000});
  }
  const bySeat=Object.fromEntries((await Promise.all(clients.map(c=>get(c.page)))).map((s,i)=>[s.seat,clients[i].page]));
  assert.deepEqual(Object.keys(bySeat).sort(),['blue1','blue2','red1','red2']);
  for(const c of clients)await c.page.locator('#readyBtn').click();
  await Promise.all(clients.map(c=>wait(c.page,'playing')));
  for(const c of clients){const s=await get(c.page);assert.equal(s.round,1);assert.equal(s.protocol,13012);}
  console.log('PASS 4 WebKit clients connected / independent draft squad room / READY');
  const scores={blue:0,red:0};
  for(let round=1;round<=4;round++){
   const winner=round%2?'blue':'red';
   scores[winner]++;
   await forcedKO(host,winner,scores,round);
   await Promise.all(clients.map(c=>wait(c.page,'draft')));
   const d=(await get(host)).draft;
   assert.equal(d.winner,winner);
   assert.equal(d.order.length,4);
   assert.equal(d.order[0],winner+(((round-1)%2)+1));
   const cardChosen=[];
   for(const [i,seat] of d.order.entries()){
    const p=bySeat[seat];
    await p.locator('#squadDraftOverlay button[data-squad-draft]:not([disabled])').first().waitFor({timeout:10000});
    if(round===4)assert.equal(await p.locator('#squadReplace').count(),1,'swap after three cards');
    const before=(await get(p)).draft;
    const id=await p.locator('#squadDraftOverlay button[data-squad-draft]:not([disabled])').first().getAttribute('data-squad-draft');
    await p.locator('#squadDraftOverlay button[data-squad-draft="'+id+'"]').click();
    cardChosen.push(id);
    await host.waitForFunction(n=>window.__brawlV3QA?.()?.draft?.turn===n||window.__brawlV3QA?.()?.draft?.complete&&n===4,i+1,{timeout:12000});
   }
   assert.equal(new Set(cardChosen).size,4);
   await Promise.all(clients.map(c=>wait(c.page,'round_end')));
   const finished=(await get(host)).draft;
   assert.equal(finished.complete,true);
   for(const seat of Object.keys(bySeat))assert.equal((finished.owned?.[seat]||[]).length,Math.min(3,round));
   await Promise.all(clients.map(c=>c.page.waitForFunction(r=>window.__brawlV3QA?.()?.game==='playing'&&window.__brawlV3QA?.()?.round===r,round+1,{timeout:20000})));
  }
  // Real accepted shot from seat blue1, rather than forcing a recoil position.
  // The host-authoritative reducer must set a motion revision and move exactly once.
  const blue1=bySeat.blue1;
  await blue1.evaluate(async()=>{
    const s=window.__brawlV3QA();
    await window.firebase.database().ref('roomsDraft2v2/'+s.roomId+'/game').transaction(g=>{
      if(g?.phase!=='playing'||g.round!==5)return;
      const id=g.seats.blue1.id;
      g.draft.owned.blue1=['recoil_shot','split_round','delayed_blast'];
      g.stats[id].draftCards=[...g.draft.owned.blue1];
      return g;
    },undefined,false);
  });
  await blue1.waitForFunction(()=>{const s=window.__brawlV3QA();
    return s?.stats?.[s.myId]?.draftCards?.includes('recoil_shot');},null,{timeout:12000});
  await blue1.waitForFunction(()=>window.__brawlDraftFireReadyQA?.()?.canShoot,
    null,{timeout:14000});
  const first=await blue1.evaluate(async()=>{
    const s=window.__brawlV3QA(),snap=await window.firebase.database().ref('roomsDraft2v2/'+s.roomId+'/game').once('value');
    const g=snap.val(),id=g.seats.blue1.id;
    return {id,round:g.round,motion:g.motions[id],seq:g.stats[id].lastActionSeq};
  });
  assert.equal(first.round,5);
  assert.equal(await blue1.evaluate(()=>window.__brawlDraftFireQA(Math.PI)),true);
  await blue1.waitForFunction(async ({id,rev})=>{
    const q=window.__brawlV3QA();
    if(!q?.roomId)return false;
    const snap=await window.firebase.database().ref('roomsDraft2v2/'+q.roomId+'/game/motions/'+id).once('value');
    return (snap.val()?.rev||0)>rev;
  },{id:first.id,rev:first.motion.rev},{timeout:14000,polling:350});
  // Firebase transaction events can be speculative before the server confirms.
  await blue1.waitForTimeout(420);
  const moved=await blue1.evaluate(async id=>{
    const q=window.__brawlV3QA(),snap=await window.firebase.database().ref('roomsDraft2v2/'+q.roomId+'/game').once('value');
    const state=snap.val();
    return {motion:state.motions[id],recoilUntil:state.stats[id].draftRecoilUntil,clock:state.clock?.t,seq:state.stats[id].lastActionSeq};
  },first.id);
  assert(moved.motion.rev>first.motion.rev,
    'host must COMMIT recoil motion, not only optimistically emit: '+JSON.stringify({first,moved}));
  assert(moved.motion.x-first.motion.x>15&&moved.motion.x-first.motion.x<=61,
    'one recoil impulse moved blue1 backwards, clipped only by cover if necessary');
  assert(moved.seq>first.seq,'recoil belongs to accepted normal shot action');
  assert(moved.recoilUntil>0,'recoil cooldown stored in canonical combat state');

  // A normal Tank/Gunner volley must split only the center bullet, twice total.
  // The counter is incremented only from inside the HOST combat tick.
  await blue1.waitForFunction(async()=>{
    const s=window.__brawlV3QA();
    const snap=await window.firebase.database().ref('roomsDraft2v2/'+s.roomId+'/game/draftCardStats/splits').once('value');
    return snap.val()>=1;
  },null,{timeout:12000,polling:300});
  const splitAudit=await blue1.evaluate(async()=>{
    const q=window.__brawlV3QA();
    const snap=await window.firebase.database().ref('roomsDraft2v2/'+q.roomId+'/game/draftCardStats').once('value');
    return snap.val();
  });
  assert.equal(splitAudit.splits,1,'five-pellet Tank volley splits one center projectile exactly once');

  // Move a genuine enemy CLIENT into range. The next volley must schedule
  // exactly one delayed blast, even if several spread pellets connect.
  const red1=bySeat.red1,redId=(await get(red1)).myId;
  await red1.waitForFunction(()=>window.__brawlDraftFireReadyQA?.()?.canShoot,null,{timeout:10000});
  assert.equal(await red1.evaluate(()=>window.__brawlDraftMoveQA(640,420)),true,'test enemy moves to open shooting lane');
  await blue1.waitForFunction(id=>{
    const p=window.__brawlV3QA()?.positionValues?.[id];
    return p&&Math.abs(p.x-640)<5&&Math.abs(p.y-420)<5;
  },redId,{timeout:12000});
  // Keep the target alive to observe the 700ms detonation. A Tank's five
  // pellets can otherwise end KO immediately, rightly cancelling pending blasts.
  await red1.evaluate(async()=>{
    const q=window.__brawlV3QA();
    await window.firebase.database().ref('roomsDraft2v2/'+q.roomId+'/game').transaction(g=>{
      if(!g||g.phase!=='playing')return;
      g.hp[q.myId]=500;return g;
    },undefined,false);
  });
  await blue1.waitForFunction(id=>window.__brawlV3QA()?.hp?.[id]===500,
    redId,{timeout:10000});
  await blue1.waitForTimeout(1150);
  assert.equal(await blue1.evaluate(()=>window.__brawlDraftFireQA(0)),true,'blue1 fires into actual online enemy');
  await blue1.waitForFunction(async()=>{
    const q=window.__brawlV3QA();
    const snap=await window.firebase.database().ref('roomsDraft2v2/'+q.roomId+'/game/draftCardStats/blasts').once('value');
    return (snap.val()||0)>=1;
  },null,{timeout:15000,polling:350});
  await blue1.waitForTimeout(450);
  const result=await blue1.evaluate(async()=>{
    const q=window.__brawlV3QA();
    const snap=await window.firebase.database().ref('roomsDraft2v2/'+q.roomId+'/game').once('value');
    return {audit:snap.val().draftCardStats,shotCount:Object.keys(snap.val().usedActions||{}).length};
  });
  assert.equal(result.audit.blasts,1,'one delayed blast per accepted fireActionId, not per pellet');
  // IMPORTANT: read from RED1, a NON-HOST browser. The host's own Firebase
  // transaction listener may see an uncommitted local speculative snapshot.
  // waitForFunction only resolves for a truthy return. It is itself the assert:
  // do not re-read a mutable Firebase snapshot after the wait has resolved.
  await red1.waitForFunction(async()=>{
    const q=window.__brawlV3QA();
    const snap=await window.firebase.database().ref('roomsDraft2v2/'+q.roomId+'/game/draftCardStats/blastHits').once('value');
    return (snap.val()||0)>=1;
  },null,{timeout:14000,polling:350});
  // Do not read the same transient hit a second time: a round-ending hit can
  // replace the entire game state before another once(value) completes.

  await host.evaluate(()=>{
   const s=window.__brawlV3QA();
   return window.firebase.database().ref('roomsDraft2v2/'+s.roomId+'/game').transaction(g=>{
    if(g?.phase!=='playing'||g.round!==5)return;
    g.phase='match_end';g.winner='blue';g.scores={blue:3,red:2};g.endedAt=Date.now();return g;
   },undefined,false);
  });
  await Promise.all(clients.map(c=>wait(c.page,'match_end')));
  assert.equal((await get(host)).scores.blue,3);
  assert.equal(await host.locator('#squadDraftOverlay:not(.hidden)').count(),0);
  for(const c of clients)assert.deepEqual(c.errors,[],'WebKit errors client '+c.index);
  console.log('PASS 4 WebKit browsers with REAL local RTDB: winner-first alternating snake, four drafts, cap swaps, three-win finish');
 }finally{
  for(const c of clients)try{await c.ctx.close();}catch(_){}
  if(browser)await browser.close();
  await new Promise(resolve=>server.close(resolve));
 }
}
run().catch(e=>{console.error(e);process.exitCode=1;try{server.close();}catch(_){}});
