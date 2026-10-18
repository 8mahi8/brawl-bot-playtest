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
// The emulator's REST endpoint returns server-committed state, unlike Firebase
// JS client local events/once() which can briefly expose speculative transactions.
async function committedGame(roomId){
 return new Promise((resolve,reject)=>{
  const url='http://127.0.0.1:9000/roomsDraft2v2/'+encodeURIComponent(roomId)+
    '/game.json?ns=demo-brawl-draft-default-rtdb';
  http.get(url,res=>{
   let data='';res.setEncoding('utf8');
   res.on('data',chunk=>data+=chunk);
   res.on('end',()=>{try{
     if(res.statusCode!==200)throw Error('Emulator REST status '+res.statusCode+': '+data.slice(0,160));
     resolve(JSON.parse(data));
   }catch(e){reject(e);}});
  }).on('error',reject);
 });
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
// Round 1 uses REAL shots and the actual KO reducer. The fixture sets both
// defending tanks to critical HP but never changes phase, winner or score.
async function realKORoundOne(bySeat,host,code){
 const shooters=[bySeat.blue1,bySeat.blue2],victims=[bySeat.red1,bySeat.red2];
 const attackerIds=await Promise.all(shooters.map(get));
 const victimIds=await Promise.all(victims.map(get));
 // Round phase changes before the startAt countdown; never drive players
 // while combatReady intentionally rejects input before match start.
 await Promise.all([...shooters,...victims].map(p=>p.waitForFunction(()=>
  window.__brawlDraftFireReadyQA?.()?.canShoot,null,{timeout:15000})));
 for(let i=0;i<2;i++){
  const y=i===0?420:700;
  assert.equal(await shooters[i].evaluate(y=>window.__brawlDraftMoveQA(525,y),y),true,
    'attacker moves to clear KO firing lane');
  assert.equal(await victims[i].evaluate(y=>window.__brawlDraftMoveQA(640,y),y),true,
    'opponent moves to clear KO firing lane');
 }
 await host.waitForFunction(ids=>{
  const p=window.__brawlV3QA?.()?.positionValues||{};
  return ids.every(({id,x,y})=>Math.abs((p[id]?.x||0)-x)<5&&
    Math.abs((p[id]?.y||0)-y)<5);
 },[{id:attackerIds[0].myId,x:525,y:420},
    {id:attackerIds[1].myId,x:525,y:700},
    {id:victimIds[0].myId,x:640,y:420},
    {id:victimIds[1].myId,x:640,y:700}],{timeout:15000});
 const seeded=await host.evaluate(async ids=>{
  const q=window.__brawlV3QA();
  return window.firebase.database().ref('roomsDraft2v2/'+q.roomId+'/game').transaction(g=>{
   if(g?.phase!=='playing'||g.round!==1)return;
   for(const id of ids){g.hp[id]=1;g.combatAt[id]=g.clock.t;if(g.protection)delete g.protection[id];}
   return g; // *Never* write match outcomes or forced enemy deaths in this test.
  },undefined,false).then(r=>r.committed);
 },victimIds.map(q=>q.myId));
 assert(seeded,'one-time 1 HP fixture set without modifying winner/phase');
 await Promise.all(shooters.map(page=>page.waitForFunction(()=>
  window.__brawlDraftFireReadyQA?.()?.canShoot,null,{timeout:15000})));
 for(const page of shooters)assert.equal(await page.evaluate(()=>
  window.__brawlDraftFireQA(0)),true,'real shot submitted through the normal action bus');
 let result,last=null;
 const deadline=Date.now()+13000;
 while(Date.now()<deadline){
  const g=await committedGame(code);
  last={phase:g?.phase,hp:victimIds.map(p=>g?.hp?.[p.myId]),
   scores:g?.scores,winner:g?.winner,kos:g?.battleStats,
   accepted:Object.values(g?.usedActions||{}).filter(a=>a.type==='shot'&&a.status==='accepted').length};
  if(['round_end','draft'].includes(g?.phase)&&g.winner==='blue'&&
    g.scores?.blue===1&&g.scores?.red===0&&
    victimIds.every(v=>g.hp?.[v.myId]===0)){result=g;break;}
  await new Promise(resolve=>setTimeout(resolve,120));
 }
 assert(result,'2 real Tank volleys must cause KO -> round_end/draft without forced score: '+
  JSON.stringify(last));
 assert(result.combatRev>1,'real battle must advance host combat state');
 assert(result.battleStats?.[attackerIds[0].myId]?.damage>0||
  result.battleStats?.[attackerIds[1].myId]?.damage>0,
  'host damage audit reflects actual combat, not direct winner assignment');
 console.log('PASS LIVE natural KO: two real Tank shots, red team eliminated, host score 1-0, draft begins');
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
  await realKORoundOne(bySeat,host,code);
  for(let round=1;round<=4;round++){
   const winner=round%2?'blue':'red';
   scores[winner]++;
   if(round!==1)await forcedKO(host,winner,scores,round);
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
    await host.waitForFunction(({n,r})=>{
      const q=window.__brawlV3QA?.(),d=q?.draft;
      if(!q||!d)return false;
      // The fourth pick may advance from a transient round_end directly into
      // the next playing round before the host UI observes draft.complete.
      if(n===4&&q.round===r+1&&q.game==='playing')return true;
      return q.round===r&&d.forRound===r&&
        (d.turn>=n||d.complete===true);
    },{n:i+1,r:round},{timeout:32000});
   }
   assert.equal(new Set(cardChosen).size,4);
   // Round-end is a brief phase; a fast host may already start the next round.
   // Verify stable, committed inventories rather than requiring all clients
   // to be simultaneously inside that transient phase.
   await Promise.all(clients.map(c=>c.page.waitForFunction(r=>{
     const q=window.__brawlV3QA?.();
     return q&&(q.game==='round_end'&&q.round===r||
       q.game==='playing'&&q.round===r+1);
   },round,{timeout:24000})));
   let finished=null,observed=null;
   const draftDeadline=Date.now()+14000;
   while(Date.now()<draftDeadline){
     const committed=await committedGame(code);
     const done=committed?.round===round&&committed?.phase==='round_end'&&
       committed?.draft?.complete===true;
     const advanced=committed?.round===round+1&&committed?.phase==='playing';
     if(done||advanced){finished=committed.draft;observed=committed;break;}
     await new Promise(resolve=>setTimeout(resolve,200));
   }
   assert(finished,'last pick must reach committed round end or next round');
   assert(observed.round===round+1||finished.complete===true,
     'draft must finish before the next round');
   for(const seat of Object.keys(bySeat))
     assert.equal((finished.owned?.[seat]||[]).length,Math.min(3,round));
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

  // A real Tank volley triggers exactly one center split in the host reducer.
  await blue1.waitForFunction(async()=>{
    const q=window.__brawlV3QA();if(!q?.roomId)return false;
    const snap=await window.firebase.database().ref('roomsDraft2v2/'+q.roomId+'/game/draftCardStats/splits').once('value');
    return (snap.val()||0)>=1;
  },null,{timeout:12000,polling:300});
  const splitAudit=await committedGame(code);
  assert.equal(splitAudit.draftCardStats?.splits,1,'Tank five-pellet volley splits only its center exactly once');

  // Genuine 4-browser network regression: normal projectile contact schedules one
  // canonical delayed blast, resolves it on the host, and syncs enemy HP.
  const red1=bySeat.red1,redId=(await get(red1)).myId;
  assert.equal(await blue1.evaluate(()=>window.__brawlDraftMoveQA(525,420)),true,
    'blue attacker moves into a clear firing lane via the normal position sender');
  assert.equal(await red1.evaluate(()=>window.__brawlDraftMoveQA(640,420)),true,
    'red enemy client moves into the same lane');
  await blue1.waitForFunction(id=>{
    const p=window.__brawlV3QA()?.positionValues?.[id];
    return p&&Math.abs(p.x-640)<5&&Math.abs(p.y-420)<5;
  },redId,{timeout:15000});
  // Keep the target alive through Tank's full volley so blast resolution
  // can be inspected before the KO round-ending transition cancels it.
  await red1.evaluate(async()=>{
    const q=window.__brawlV3QA();
    await window.firebase.database().ref('roomsDraft2v2/'+q.roomId+'/game').transaction(g=>{
      if(g?.phase!=='playing'||g.round!==5)return;
      g.hp[q.myId]=500;return g;
    },undefined,false);
  });
  await blue1.waitForFunction(id=>window.__brawlV3QA()?.hp?.[id]===500,redId,{timeout:10000});
  await blue1.waitForTimeout(1200);
  assert.equal(await blue1.evaluate(()=>window.__brawlDraftFireQA(0)),true,
    'real blue client sends a normal Tank shot toward the red client');
  // Poll the ACTUAL emulator datastore; client once('value') can expose
  // optimistic snapshots that later roll back under concurrent host ticks.
  let blastResult=null,lastServerState=null;
  const blastDeadline=Date.now()+18000;
  while(Date.now()<blastDeadline){
    const g=await committedGame(code);
    const applied=Object.keys(g?.usedHits||{}).filter(
      k=>k.startsWith('draftBlast:')&&k.endsWith(':'+redId));
    lastServerState={hp:g?.hp?.[redId],phase:g?.phase,
      used:Object.keys(g?.draft?.blastUsed||{}),
      applied,pending:Object.values(g?.scheduled||{}).filter(u=>u.kind==='draftBlast').length,
      draftKeys:Object.keys(g?.draft||{}),cooldown:g?.draft?.blastCooldown||{}};
    if(lastServerState.phase==='playing'&&lastServerState.used.length===1&&
       applied.length===1&&lastServerState.pending===0&&lastServerState.hp<=490){
      blastResult=lastServerState;break;
    }
    await new Promise(resolve=>setTimeout(resolve,250));
  }
  assert(blastResult,'blast was not stably committed to server: '+JSON.stringify(lastServerState));
  assert.equal(blastResult.phase,'playing','test target must remain alive until blast');
  assert.equal(blastResult.used.length,1,'one blast authorization per firing action, not per pellet: '+JSON.stringify(blastResult));
  assert.equal(blastResult.applied.length,1,'delayed blast damages the red enemy exactly once');
  assert.equal(blastResult.pending,0,'scheduled blast is consumed by host reducer');
  assert(blastResult.hp<=490,'real enemy lost at least 10 HP from the delayed blast: '+JSON.stringify(blastResult));
  for(const page of [host,...others]){
    await page.waitForFunction(id=>(window.__brawlV3QA()?.hp?.[id]||Infinity)<=490,
      redId,{timeout:13000});
  }
  console.log('PASS 2vs2 LIVE host blast: 1 original volley, 1 delayed effect, non-host RTDB HP and 4-client sync');

  // Live 4-client test of a wall reflection: first replace recoil with ricochet,
  // then make a real shot against the wall at x=650 (room's verified KO map).
  await blue1.evaluate(async()=>{
    const q=window.__brawlV3QA();
    await window.firebase.database().ref('roomsDraft2v2/'+q.roomId+'/game').transaction(g=>{
      if(g?.phase!=='playing'||g.round!==5)return;
      g.draft.owned.blue1=['ricochet','split_round','delayed_blast'];
      g.stats[g.seats.blue1.id].draftCards=[...g.draft.owned.blue1];
      return g;
    },undefined,false);
  });
  await blue1.waitForFunction(()=>window.__brawlV3QA()?.stats?.[window.__brawlV3QA()?.myId]?.draftCards?.includes('ricochet'),
    null,{timeout:12000});
  assert.equal(await blue1.evaluate(()=>window.__brawlDraftMoveQA(575,300)),true,
    'attacker moves to open lane beside the north wall');
  await blue1.waitForTimeout(1350);
  assert.equal(await blue1.evaluate(()=>window.__brawlDraftFireQA(0)),true,
    'ricochet card owner fires a real normal volley into a wall');
  let ricochetResult=null,lastRicochet=null;
  const ricochetDeadline=Date.now()+13000;
  while(Date.now()<ricochetDeadline){
    const g=await committedGame(code);
    lastRicochet={phase:g?.phase,round:g?.round,
      ricochets:g?.draftCardStats?.ricochets||0,splits:g?.draftCardStats?.splits||0};
    if(lastRicochet.phase==='playing'&&lastRicochet.ricochets>=1){
      ricochetResult=lastRicochet;break;
    }
    await new Promise(resolve=>setTimeout(resolve,220));
  }
  assert(ricochetResult,'host must commit wall ricochet in RTDB: '+JSON.stringify(lastRicochet));
  assert(ricochetResult.ricochets<=5,'Tank five-pellet volley cannot spawn unlimited reflections');
  console.log('PASS 2vs2 LIVE host wall ricochet: one bounce per pellet, bounded Tank volley, 4 WebKit clients');

  // 4 REAL WebKit clients: distinct GAD2 mine button -> host placement -> enemy trigger.
  await blue1.evaluate(async()=>{
    const q=window.__brawlV3QA();
    await window.firebase.database().ref('roomsDraft2v2/'+q.roomId+'/game').transaction(g=>{
      if(g?.phase!=='playing'||g.round!==5)return;
      g.draft.owned.blue1=['trap_mine','split_round','delayed_blast'];
      g.stats[g.seats.blue1.id].draftCards=[...g.draft.owned.blue1];
      return g;
    },undefined,false);
  });
  await blue1.waitForFunction(()=>window.__brawlDraftGad2QA?.()?.equipped==='trap_mine',
    null,{timeout:12000});
  assert.equal(await blue1.evaluate(()=>window.__brawlDraftMoveQA(575,420)),true);
  assert.equal(await red1.evaluate(()=>window.__brawlDraftMoveQA(720,420)),true);
  await blue1.waitForFunction(id=>{
    const p=window.__brawlV3QA()?.positionValues?.[id];
    return p&&Math.abs(p.x-720)<5&&Math.abs(p.y-420)<5;
  },redId,{timeout:13000});
  const mineStart=await committedGame(code);
  const startHp=mineStart.hp[redId],blueId=mineStart.seats.blue1.id;
  const normalGadgets=mineStart.stats[blueId].gadgets;
  assert.equal(await blue1.evaluate(()=>window.__brawlDraftGad2FireQA(0)),true,
    'mine owner dispatches a real separate GAD2 action');
  let minePlaced=null;
  const placeDeadline=Date.now()+11000;
  while(Date.now()<placeDeadline){
    const g=await committedGame(code);
    if(g?.gad2Mines?.blue1?.kind==='trap_mine'&&g?.draftCardStats?.gad2MinesPlaced>=1){
      minePlaced=g;break;
    }
    await new Promise(resolve=>setTimeout(resolve,170));
  }
  assert(minePlaced,'RTDB must commit host-owned mine placement');
  assert.equal(Object.keys(minePlaced.gad2Mines).length,1,'one active mine per seat');
  assert.equal(minePlaced.stats[blueId].gadgets,normalGadgets,
    'GAD2 cannot consume character gadget charges');
  assert(minePlaced.draft.gadget2ReadyAt.blue1>minePlaced.clock.t,
    'GAD2 cooldown is committed by the host');
  assert.equal(await red1.evaluate(()=>window.__brawlDraftMoveQA(640,420)),true,
    'enemy moves into the trap after it has been placed');
  let mineHit=null,lastMine=null;
  const hitDeadline=Date.now()+14000;
  while(Date.now()<hitDeadline){
    const g=await committedGame(code);
    lastMine={phase:g?.phase,round:g?.round,hp:g?.hp?.[redId],
      slowUntil:g?.debuffs?.[redId]?.slowUntil||0,clock:g?.clock?.t,
      triggered:g?.draftCardStats?.gad2MinesTriggered||0,
      mines:Object.keys(g?.gad2Mines||{})};
    if(lastMine.phase==='playing'&&lastMine.triggered===1&&
       lastMine.hp<=startHp-8&&lastMine.mines.length===0){
      mineHit=lastMine;break;
    }
    await new Promise(resolve=>setTimeout(resolve,220));
  }
  assert(mineHit,'mine host damage and consumption not committed: '+JSON.stringify(lastMine));
  assert(mineHit.slowUntil>0,'mine applied the canonical slow debuff');
  await Promise.all(clients.map(c=>c.page.waitForFunction(({id,hp})=>{
    return window.__brawlV3QA?.()?.hp?.[id]<=hp;
  },{id:redId,hp:mineHit.hp},{timeout:14000})));
  console.log('PASS LIVE GAD2 mine: 4 WebKit clients, separate button, host 8 damage, 1 hit, cooldown and HP sync');

  // Smoke must reuse bush stealth rules: hidden until enemy approaches or
  // a normal shot reveals the shooter; smoke blocks no projectiles.
  await blue1.evaluate(async()=>{
    const q=window.__brawlV3QA();
    await window.firebase.database().ref('roomsDraft2v2/'+q.roomId+'/game').transaction(g=>{
      if(g?.phase!=='playing'||g.round!==5)return;
      g.draft.owned.blue1=['smoke','split_round','delayed_blast'];
      g.draft.gadget2ReadyAt.blue1=0; // fixture: independent ability after mine.
      g.stats[g.seats.blue1.id].draftCards=[...g.draft.owned.blue1];
      return g;
    },undefined,false);
  });
  await blue1.waitForFunction(()=>window.__brawlDraftGad2QA?.()?.equipped==='smoke',
    null,{timeout:12000});
  assert.equal(await blue1.evaluate(()=>window.__brawlDraftMoveQA(575,420)),true);
  assert.equal(await red1.evaluate(()=>window.__brawlDraftMoveQA(970,500)),true);
  // Reuse the earlier blueId identifier for the same seat.
  await blue1.waitForFunction(id=>{
    const p=window.__brawlV3QA()?.positionValues?.[id];
    return p&&Math.abs(p.x-970)<5&&Math.abs(p.y-500)<5;
  },redId,{timeout:13000});
  await blue1.waitForFunction(()=>{
    const q=window.__brawlV3QA(),p=q?.positionValues?.[q?.myId];
    return p&&Math.abs(p.x-575)<5&&Math.abs(p.y-420)<5;
  },null,{timeout:13000});
  assert.equal(await blue1.evaluate(()=>window.__brawlDraftGad2FireQA(0)),true,
    'real owner sends smoke GAD2 through normal action bus');
  let cloudState=null;
  const smokeDeadline=Date.now()+11000;
  while(Date.now()<smokeDeadline){
    const g=await committedGame(code);
    if(g?.gad2Smokes?.blue1?.kind==='smoke'&&g?.draftCardStats?.gad2SmokesPlaced===1){
      cloudState=g;break;
    }
    await new Promise(resolve=>setTimeout(resolve,160));
  }
  assert(cloudState,'host must COMMIT GAD2 smoke in same RTDB state');
  assert.equal(cloudState.gad2Smokes.blue1.radius,100,'100 unit radius');
  assert.equal(cloudState.gad2Smokes.blue1.until-cloudState.gad2Smokes.blue1.start,4000,
    '4-second canonical smoke lifetime');
  assert.equal(cloudState.draft.gadget2ReadyAt.blue1-cloudState.gad2Smokes.blue1.start,12000,
    'same independent 12-second GAD2 cooldown');
  await red1.waitForFunction(id=>{
    const x=window.__brawlDraftStealthQA?.(id),q=window.__brawlV3QA?.();
    return x&&q?.game==='playing'&&x.canSeeTarget===false;
  },blueId,{timeout:3500,polling:100});
  const hidden=await blue1.evaluate(()=>window.__brawlDraftStealthQA());
  assert(hidden.ownInSmoke,'own player is concealed in canonical smoke');
  assert.equal(hidden.ownState,'hidden','clear enemy distance yields owner-facing 潜伏中');
  await blue1.waitForFunction(()=>window.__brawlDraftFireReadyQA?.()?.canShoot,
    null,{timeout:9000});
  assert.equal(await blue1.evaluate(()=>window.__brawlDraftFireQA(0)),true,
    'firing from smoke is accepted as a normal shot');
  let revealed=null;
  const revealDeadline=Date.now()+2200;
  while(Date.now()<revealDeadline){
    const g=await committedGame(code);
    const remaining=(g?.reveals?.[blueId]||0)-(g?.clock?.t||0);
    if(remaining>0&&remaining<=700&&g?.gad2Smokes?.blue1){
      revealed=remaining;break;
    }
    await new Promise(resolve=>setTimeout(resolve,85));
  }
  assert(revealed,'host must reveal normal shooter within smoke for 700ms');
  console.log('PASS 2vs2 LIVE GAD2 smoke: 4 clients, canonical duration/cooldown, bush conceal, 700ms attack reveal');

  // REAL 4-client host transaction: place a warp beacon, move beyond a solid
  // wall, return without path collision, and reconcile all clients from motion.rev.
  await blue1.evaluate(async()=>{
    const q=window.__brawlV3QA();
    await window.firebase.database().ref('roomsDraft2v2/'+q.roomId+'/game').transaction(g=>{
      if(g?.phase!=='playing'||g.round!==5)return;
      g.draft.owned.blue1=['warp_beacon','split_round','delayed_blast'];
      g.draft.gadget2ReadyAt.blue1=0; // isolated test fixture after mine/smoke
      g.stats[g.seats.blue1.id].draftCards=[...g.draft.owned.blue1];
      return g;
    },undefined,false);
  });
  await blue1.waitForFunction(()=>window.__brawlDraftGad2QA?.()?.equipped==='warp_beacon',
    null,{timeout:12000});
  assert.equal(await blue1.evaluate(()=>window.__brawlDraftMoveQA(575,300)),true,
    'warp owner approaches wall-free beacon origin');
  await host.waitForFunction(id=>{
    const p=window.__brawlV3QA?.()?.positionValues?.[id];
    return p&&Math.abs(p.x-575)<4&&Math.abs(p.y-300)<4;
  },blueId,{timeout:13000});
  const beforeWarp=await committedGame(code);
  const warpGadgets=beforeWarp.stats[blueId].gadgets;
  const priorRev=beforeWarp.motions[blueId].rev;
  assert.equal(await blue1.evaluate(()=>window.__brawlDraftGad2FireQA(0)),true,
    'GAD2 uses real action bus to place beacon');
  let placed=null;
  const placedDeadline=Date.now()+9000;
  while(Date.now()<placedDeadline){
    const g=await committedGame(code);
    if(g?.gad2Beacons?.blue1?.kind==='warp_beacon'&&g?.draftCardStats?.gad2BeaconsPlaced===1){
      placed=g;break;
    }
    await new Promise(resolve=>setTimeout(resolve,120));
  }
  assert(placed,'host must commit beacon before return');
  assert.equal(placed.gad2Beacons.blue1.until-placed.gad2Beacons.blue1.start,7000);
  // E2E timing fixture: after proving the native 7s TTL, extend only the
  // emulator beacon so slow CI WebKit/RTDB pose propagation cannot expire it
  // while moving a test actor across the wall. Production duration stays 7s.
  await blue1.evaluate(async()=>{
    const q=window.__brawlV3QA();
    await window.firebase.database().ref('roomsDraft2v2/'+q.roomId+'/game').transaction(g=>{
      if(g?.gad2Beacons?.blue1&&g.phase==='playing'&&g.round===5){
        g.gad2Beacons.blue1.until=Math.max(g.gad2Beacons.blue1.until,g.clock.t+25000);
        return g;
      }
    },undefined,false);
  });

  assert(Math.hypot(placed.gad2Beacons.blue1.x-575,placed.gad2Beacons.blue1.y-300)<5,
    'host saves the real original position, not the eventual destination');
  assert.equal(placed.stats[blueId].gadgets,warpGadgets,
    'beacon placement does not consume normal gadget');
  assert.equal(await blue1.evaluate(()=>window.__brawlDraftMoveQA(970,300)),true,
    'test player moves beyond the solid central wall');
  await host.waitForFunction(id=>{
    const p=window.__brawlV3QA?.()?.positionValues?.[id];
    return p&&Math.abs(p.x-970)<5&&Math.abs(p.y-300)<5;
  },blueId,{timeout:13000});
  assert.equal(await blue1.evaluate(()=>window.__brawlDraftGad2FireQA(0)),true,
    'reusing GAD2 returns through the intervening wall');
  let warped=null,lastWarp=null;
  const returnDeadline=Date.now()+10500;
  while(Date.now()<returnDeadline){
    const g=await committedGame(code);
    lastWarp={phase:g?.phase,returns:g?.draftCardStats?.gad2WarpReturns||0,
      beacons:Object.keys(g?.gad2Beacons||{}),motion:g?.motions?.[blueId],
      cooldown:g?.draft?.gadget2ReadyAt?.blue1||0,time:g?.clock?.t};
    if(lastWarp.phase==='playing'&&lastWarp.returns===1&&
      lastWarp.beacons.length===0&&lastWarp.motion?.rev>priorRev){
      warped=g;break;
    }
    await new Promise(resolve=>setTimeout(resolve,150));
  }
  assert(warped,'server-side warp is not committed: '+JSON.stringify(lastWarp));
  assert(Math.hypot(warped.motions[blueId].x-575,warped.motions[blueId].y-300)<6,
    'warp MUST return to beacon across intervening wall');
  assert(warped.draft.gadget2ReadyAt.blue1-warped.clock.t>13500,
    '15s return cooldown belongs to canonical combat clock');
  assert.equal(warped.stats[blueId].gadgets,warpGadgets,
    'GAD2 round trip never spends normal gadget');
  await Promise.all(clients.map(c=>c.page.waitForFunction(({id,rev})=>{
    const s=window.__brawlV3QA?.(),m=s?.motions?.[id];
    return m&&m.rev>rev&&Math.hypot(m.x-575,m.y-300)<6;
  },{id:blueId,rev:priorRev},{timeout:14000})));
  await blue1.waitForFunction(()=>{const p=window.__brawlV3QA?.()?.local;
    return p&&Math.hypot(p.x-575,p.y-300)<9;},null,{timeout:10000});
  console.log('PASS LIVE GAD2 warp: 7s beacon, real 4-client position sync, wall bypass, 15s cooldown, no normal gadget use');


  // Regression: a beacon is a tangible one-shot destructible object. Friendly
  // shots ignore it; a genuine enemy projectile destroys it exactly once.
  await blue1.evaluate(async()=>{
    const q=window.__brawlV3QA();
    await window.firebase.database().ref('roomsDraft2v2/'+q.roomId+'/game').transaction(g=>{
      if(g?.phase!=='playing'||g.round!==5)return;
      g.draft.gadget2ReadyAt.blue1=0; // E2E fixture: independent second activation
      return g;
    },undefined,false);
  });
  const blue2=bySeat.blue2;
  const blue2Id=(await get(blue2)).myId;
  assert.equal(await blue1.evaluate(()=>window.__brawlDraftMoveQA(575,420)),true);
  assert.equal(await blue2.evaluate(()=>window.__brawlDraftMoveQA(445,420)),true);
  assert.equal(await red1.evaluate(()=>window.__brawlDraftMoveQA(720,520)),true);
  await host.waitForFunction(ids=>{
    const ps=window.__brawlV3QA?.()?.positionValues||{};
    return Math.abs((ps[ids.blue1]?.x||0)-575)<5&&
      Math.abs((ps[ids.blue2]?.x||0)-445)<5&&
      Math.abs((ps[ids.red1]?.y||0)-520)<5;
  },{blue1:blueId,blue2:blue2Id,red1:redId},{timeout:13000});
  assert.equal(await blue1.evaluate(()=>window.__brawlDraftGad2FireQA(0)),true);
  let beacon2=null;
  const pDeadline=Date.now()+9000;
  while(Date.now()<pDeadline){
    const g=await committedGame(code);
    if(g?.gad2Beacons?.blue1&&g?.draftCardStats?.gad2BeaconsPlaced===2){
      beacon2=g;break;
    }
    await new Promise(resolve=>setTimeout(resolve,140));
  }
  assert(beacon2,'rearmed warp beacon must be canonical');
  // Extend ONLY local test beacon longevity after testing the real 7s
  // definition above: verifying friendly/enemy shots requires repositioning.
  await blue1.evaluate(async()=>{
    const q=window.__brawlV3QA();
    await window.firebase.database().ref('roomsDraft2v2/'+q.roomId+'/game').transaction(g=>{
      if(g?.gad2Beacons?.blue1&&g.phase==='playing'&&g.round===5){
        g.gad2Beacons.blue1.until=Math.max(g.gad2Beacons.blue1.until,g.clock.t+25000);
        return g;
      }
    },undefined,false);
  });

  const brokenBefore=beacon2.draftCardStats?.gad2BeaconsBroken||0;
  assert.equal(await blue1.evaluate(()=>window.__brawlDraftMoveQA(575,550)),true);
  await blue2.waitForFunction(()=>window.__brawlDraftFireReadyQA?.()?.canShoot,
    null,{timeout:12000});
  assert.equal(await blue2.evaluate(()=>window.__brawlDraftFireQA(0)),true,
    'allied bullet fires through friendly beacon');
  await blue2.waitForTimeout(500);
  let stillThere=await committedGame(code);
  assert(stillThere.gad2Beacons?.blue1,'friendly projectile may NOT break allied beacon');
  assert.equal(stillThere.draftCardStats?.gad2BeaconsBroken||0,brokenBefore,
    'friendly projectile cannot increment break counter');
  assert.equal(await red1.evaluate(()=>window.__brawlDraftMoveQA(720,420)),true);
  await host.waitForFunction(id=>{
    const p=window.__brawlV3QA?.()?.positionValues?.[id];
    return p&&Math.abs(p.x-720)<5&&Math.abs(p.y-420)<5;
  },redId,{timeout:12000});
  await red1.waitForFunction(()=>window.__brawlDraftFireReadyQA?.()?.canShoot,
    null,{timeout:12000});
  assert.equal(await red1.evaluate(()=>window.__brawlDraftFireQA(Math.PI)),true,
    'enemy sends a REAL normal volley toward the beacon');
  let broken=null,last=null;
  const breakDeadline=Date.now()+10500;
  while(Date.now()<breakDeadline){
    const g=await committedGame(code);
    last={phase:g?.phase,broken:g?.draftCardStats?.gad2BeaconsBroken||0,
      beacons:Object.keys(g?.gad2Beacons||{}),cooldown:g?.draft?.gadget2ReadyAt?.blue1,
      time:g?.clock?.t};
    if(last.phase==='playing'&&last.broken===brokenBefore+1&&
       last.beacons.length===0&&last.cooldown>last.time){
      broken=g;break;
    }
    await new Promise(resolve=>setTimeout(resolve,180));
  }
  assert(broken,'enemy projectile did not break beacon exactly once: '+JSON.stringify(last));
  assert(broken.draft.gadget2ReadyAt.blue1-broken.clock.t>13500,
    'enemy destruction starts full 15-second GAD2 cooldown');
  await Promise.all(clients.map(c=>c.page.waitForFunction(()=>{
    const q=window.__brawlDraftGad2QA?.();
    return q&&!q.beacons.blue1&&q.beaconBroken>=1;
  },null,{timeout:13000})));
  console.log('PASS LIVE warp counterplay: friendly fire ignored, enemy normal projectile breaks exactly 1 beacon, cooldown synced');


  // Real GAD2 wall deployment, host projectile collision, four-client wall
  // replication, local Safari movement rejection, and canonical expiration.
  await blue1.evaluate(async()=>{
    const q=window.__brawlV3QA();
    await window.firebase.database().ref('roomsDraft2v2/'+q.roomId+'/game').transaction(g=>{
      if(g?.phase!=='playing'||g.round!==5)return;
      g.draft.owned.blue1=['portable_wall','split_round','delayed_blast'];
      g.draft.gadget2ReadyAt.blue1=0;
      g.stats[g.seats.blue1.id].draftCards=[...g.draft.owned.blue1];
      g.hp[g.seats.red1.id]=500; // fixture to avoid forced KO during collision test
      return g;
    },undefined,false);
  });
  await blue1.waitForFunction(()=>window.__brawlDraftGad2QA?.()?.equipped==='portable_wall',
    null,{timeout:11000});
  // iPad Safari: host-rejected placement must explain WHY, preserve the
  // GAD2 cooldown, and allow an immediate valid retry.
  const gad2Layout=await blue1.evaluate(()=>{
    const b=document.querySelector('#squadGad2Action')?.getBoundingClientRect(),
      normal=document.querySelector('#gadAction')?.getBoundingClientRect(),
      screen=document.querySelector('#app')?.getBoundingClientRect();
    if(!b||!normal||!screen)return null;
    return {
      visible:b.width>30&&b.height>30,
      inside:b.left>=screen.left-1&&b.top>=screen.top-1&&
        b.right<=screen.right+1&&b.bottom<=screen.bottom+1,
      overlaps:b.left<normal.right&&b.right>normal.left&&
        b.top<normal.bottom&&b.bottom>normal.top
    };
  });
  assert(gad2Layout?.visible&&gad2Layout.inside&&!gad2Layout.overlaps,
    'landscape Safari GAD2 button must fit on screen without overlapping base gadget: '+
      JSON.stringify(gad2Layout));
  assert.equal(await blue1.evaluate(()=>window.__brawlDraftMoveQA(575,300)),true,
    'begin rejected-placement test outside permanent KO wall');
  await host.waitForFunction(id=>{
    const p=window.__brawlV3QA?.()?.positionValues?.[id];
    return p&&Math.abs(p.x-575)<5&&Math.abs(p.y-300)<5;
  },blueId,{timeout:11000});
  const invalidBefore=await committedGame(code);
  assert.equal(await blue1.evaluate(()=>window.__brawlDraftGad2FireQA(0)),true,
    'send an actual GAD2 button action into the permanent wall');
  let denied=null;
  const rejectDeadline=Date.now()+9500;
  while(Date.now()<rejectDeadline){
    const g=await committedGame(code);
    const receipt=Object.values(g?.usedActions||{}).find(x=>
      x.owner===blueId&&x.type==='gadget2'&&
      x.status==='rejected'&&x.reason==='gadget2_wall_placement');
    if(receipt){denied=g;break;}
    await new Promise(resolve=>setTimeout(resolve,100));
  }
  assert(denied,'real host must reject wall overlap with an actionable reason');
  assert(!denied.gad2Walls?.blue1,'rejected placement cannot create any cover');
  assert.equal(denied.draft.gadget2ReadyAt?.blue1||0,0,
    'a rejected ability must not spend its cooldown');
  assert.equal(denied.stats[blueId].gadgets,invalidBefore.stats[blueId].gadgets,
    'invalid GAD2 action cannot spend the original character gadget');
  await blue1.waitForFunction(()=>window.__brawlDraftGad2QA?.()?.lastToast?.
    includes('壁を設置できません'),null,{timeout:7000});
  console.log('PASS LIVE GAD2 invalid placement: host reason, visible Japanese feedback, no cooldown/gadget spend');
  assert.equal(await blue1.evaluate(()=>window.__brawlDraftMoveQA(575,500)),true);
  assert.equal(await red1.evaluate(()=>window.__brawlDraftMoveQA(720,500)),true);
  await host.waitForFunction(ids=>{
    const p=window.__brawlV3QA?.()?.positionValues||{};
    return Math.abs((p[ids.a]?.x||0)-575)<5&&Math.abs((p[ids.a]?.y||0)-500)<5&&
      Math.abs((p[ids.b]?.x||0)-720)<5&&Math.abs((p[ids.b]?.y||0)-500)<5;
  },{a:blueId,b:redId},{timeout:14000});
  const wallStart=await committedGame(code),originalGadgets=wallStart.stats[blueId].gadgets;
  assert.equal(await blue1.evaluate(()=>window.__brawlDraftGad2FireQA(0)),true);
  let wallSet=null;
  const wallDeadline=Date.now()+9000;
  while(Date.now()<wallDeadline){
    const g=await committedGame(code);
    if(g?.gad2Walls?.blue1&&g?.draftCardStats?.gad2WallsPlaced===1){wallSet=g;break;}
    await new Promise(resolve=>setTimeout(resolve,140));
  }
  assert(wallSet,'host must commit a portable wall into RTDB');
  const w=wallSet.gad2Walls.blue1;
  assert.equal(w.w,42);assert.equal(w.h,112);
  assert.equal(w.until-w.start,4000,'4s wall lifetime from host clock');
  assert.equal(wallSet.draft.gadget2ReadyAt.blue1-w.start,12000,'independent 12s cooldown');
  assert.equal(wallSet.stats[blueId].gadgets,originalGadgets,
    'character gadget charges are not spent by temporary wall');
  assert(Math.abs(w.x-649)<5&&Math.abs(w.y-444)<5,'portable wall is 95px ahead of the owner');
  await Promise.all(clients.map(c=>c.page.waitForFunction(()=>{
    const q=window.__brawlDraftGad2QA?.();
    return q?.walls?.blue1?.w===42&&q?.wallPlaced===1;
  },null,{timeout:9000})));
  // Isolate gameplay from CI slow movement/snapshot propagation after
  // verifying the *native* 4s lifetime above. No runtime code is changed.
  await blue1.evaluate(async()=>{
    const q=window.__brawlV3QA();
    await window.firebase.database().ref('roomsDraft2v2/'+q.roomId+'/game').transaction(g=>{
      if(g?.gad2Walls?.blue1&&g.phase==='playing'){
        g.gad2Walls.blue1.until=Math.max(g.gad2Walls.blue1.until,g.clock.t+14000);
        return g;
      }
    },undefined,false);
  });
  assert.equal(await blue1.evaluate(()=>window.__brawlDraftMoveQA(670,500)),false,
    'WebKit position diagnostic cannot teleport inside temporary wall');
  await blue1.waitForFunction(()=>window.__brawlDraftFireReadyQA?.()?.canShoot,
    null,{timeout:11000});
  const beforeHit=(await committedGame(code)).hp[redId];
  assert.equal(await blue1.evaluate(()=>window.__brawlDraftFireQA(0)),true,
    'shoot a real five-pellet Tank volley toward the enemy through temporary cover');
  await blue1.waitForTimeout(750);
  const afterHit=await committedGame(code);
  assert.equal(afterHit.hp[redId],beforeHit,'all Tank shots are absorbed by temporary cover');
  assert(afterHit.gad2Walls?.blue1,'host keeps an active cover wall while blocking volley');
  // Force imminent expiry only in the test fixture and allow host tick to prune.
  await blue1.evaluate(async()=>{
    const q=window.__brawlV3QA();
    await window.firebase.database().ref('roomsDraft2v2/'+q.roomId+'/game').transaction(g=>{
      if(g?.gad2Walls?.blue1&&g.phase==='playing'){
        g.gad2Walls.blue1.until=g.clock.t+100;
        return g;
      }
    },undefined,false);
  });
  let expired=false;
  const expireDeadline=Date.now()+6500;
  while(Date.now()<expireDeadline){
    const g=await committedGame(code);
    if(g?.phase==='playing'&&!g?.gad2Walls?.blue1){expired=true;break;}
    await new Promise(resolve=>setTimeout(resolve,120));
  }
  assert(expired,'host combat clock must clear expired cover from RTDB');
  await Promise.all(clients.map(c=>c.page.waitForFunction(()=>{
    return !window.__brawlDraftGad2QA?.()?.walls?.blue1;
  },null,{timeout:9000})));
  assert.equal(await blue1.evaluate(()=>window.__brawlDraftMoveQA(670,500)),true,
    'expired wall releases client-side movement constraint');
  console.log('PASS LIVE GAD2 portable wall: 4 WebKit clients, host 4s/12s timers, Tank volley blocked, client movement collision and expiry');

  // Real 4-client local Firebase hologram: host creates moving decoy, fake
  // projectiles never hurt players, allies-only mark, enemy shot dissolves once.
  await blue1.evaluate(async()=>{
    const q=window.__brawlV3QA();
    await window.firebase.database().ref('roomsDraft2v2/'+q.roomId+'/game').transaction(g=>{
      if(g?.phase!=='playing'||g.round!==5)return;
      g.draft.owned.blue1=['hologram','split_round','delayed_blast'];
      g.draft.gadget2ReadyAt.blue1=0;
      g.stats[g.seats.blue1.id].draftCards=[...g.draft.owned.blue1];
      g.hp[g.seats.red1.id]=500;
      return g;
    },undefined,false);
  });
  await blue1.waitForFunction(()=>window.__brawlDraftGad2QA?.()?.equipped==='hologram',
    null,{timeout:12000});
  assert.equal(await blue1.evaluate(()=>window.__brawlDraftMoveQA(575,500)),true);
  assert.equal(await red1.evaluate(()=>window.__brawlDraftMoveQA(720,500)),true);
  await host.waitForFunction(ids=>{
    const p=window.__brawlV3QA?.()?.positionValues||{};
    return Math.abs((p[ids.a]?.x||0)-575)<5&&Math.abs((p[ids.a]?.y||0)-500)<5&&
      Math.abs((p[ids.b]?.x||0)-720)<5&&Math.abs((p[ids.b]?.y||0)-500)<5;
  },{a:blueId,b:redId},{timeout:13000});
  const beforeHolo=await committedGame(code);
  const normalGadgetCount=beforeHolo.stats[blueId].gadgets;
  assert.equal(await blue1.evaluate(()=>window.__brawlDraftGad2FireQA(0)),true);
  let holoSet=null;
  const holoDeadline=Date.now()+9500;
  while(Date.now()<holoDeadline){
    const g=await committedGame(code);
    if(g?.gad2Holograms?.blue1?.kind==='hologram'&&
       g?.draftCardStats?.gad2HologramsPlaced===1){holoSet=g;break;}
    await new Promise(resolve=>setTimeout(resolve,140));
  }
  assert(holoSet,'host must commit moving hologram independently of actors');
  const firstHolo=holoSet.gad2Holograms.blue1;
  assert.equal(firstHolo.until-firstHolo.start,7000,'hologram native duration 7s');
  assert.equal(holoSet.draft.gadget2ReadyAt.blue1-firstHolo.start,14000,
    'hologram native cooldown 14s');
  assert.equal(holoSet.stats[blueId].gadgets,normalGadgetCount,
    'hologram does not spend regular gadget');
  await Promise.all(clients.map(c=>c.page.waitForFunction(()=>{
    return window.__brawlDraftGad2QA?.()?.holograms?.blue1?.kind==='hologram';
  },null,{timeout:9500})));
  assert.equal((await blue1.evaluate(()=>window.__brawlDraftHoloViewQA('blue1'))).label,'分身',
    'owner sees decoy label');
  assert.equal((await blue2.evaluate(()=>window.__brawlDraftHoloViewQA('blue1'))).label,'分身',
    'ally distinguishes teammate decoy');
  assert.equal((await red1.evaluate(()=>window.__brawlDraftHoloViewQA('blue1'))).label,'ENEMY',
    'opponent sees no giveaway label');
  // After checking 7s native TTL, extend only the local E2E fixture to
  // allow slow RTDB pose synchronization and a genuine subsequent shot.
  await blue1.evaluate(async()=>{
    const q=window.__brawlV3QA();
    await window.firebase.database().ref('roomsDraft2v2/'+q.roomId+'/game').transaction(g=>{
      if(g?.gad2Holograms?.blue1&&g.phase==='playing'){
        g.gad2Holograms.blue1.until=Math.max(g.gad2Holograms.blue1.until,g.clock.t+26000);
        return g;
      }
    },undefined,false);
  });
  let aiAndFake=null,lastHolo=null;
  const aiDeadline=Date.now()+8500;
  while(Date.now()<aiDeadline){
    const g=await committedGame(code),h=g?.gad2Holograms?.blue1;
    lastHolo={holo:h,shots:g?.draftCardStats?.gad2HoloShotsFired||0};
    if(h&&Math.hypot(h.x-firstHolo.x,h.y-firstHolo.y)>7&&lastHolo.shots>=1){
      aiAndFake=g;break;
    }
    await new Promise(resolve=>setTimeout(resolve,150));
  }
  assert(aiAndFake,'hologram must move as AI and shoot harmless fake shots: '+JSON.stringify(lastHolo));
  assert.equal(aiAndFake.hp[redId],500,'fake bullets NEVER damage the red team');
  assert.equal(aiAndFake.stats[blueId].ult,holoSet.stats[blueId].ult,
    'fake bullets do not charge their owner ULT');
  assert.equal(Object.values(aiAndFake.gad2FakeShots||{}).every(s=>s.damage===0),true,
    'all host-authored fake projectiles have exactly zero damage');
  assert.equal(await blue1.evaluate(()=>window.__brawlDraftMoveQA(575,640)),true,
    'owner relocates away from decoy firing lane');
  assert.equal(await red1.evaluate(()=>window.__brawlDraftMoveQA(780,500)),true);
  await host.waitForFunction(ids=>{
    const ps=window.__brawlV3QA?.()?.positionValues||{};
    return Math.abs((ps[ids.blue]?.y||0)-640)<5&&
      Math.abs((ps[ids.red]?.x||0)-780)<5;
  },{blue:blueId,red:redId},{timeout:13500});
  await blue1.evaluate(async()=>{
    const q=window.__brawlV3QA();
    await window.firebase.database().ref('roomsDraft2v2/'+q.roomId+'/game').transaction(g=>{
      const h=g?.gad2Holograms?.blue1;
      if(!h||g.phase!=='playing')return;
      h.x=650;h.y=500;h.a=0;
      h.fireAt=g.clock.t+20000; // no new fake shots during the shot collision proof
      h.until=Math.max(h.until,g.clock.t+25000);
      return g;
    },undefined,false);
  });
  const holoBeforeShot=await committedGame(code);
  const realOwnerHp=holoBeforeShot.hp[blueId],realEnemyHp=holoBeforeShot.hp[redId];
  await red1.waitForFunction(()=>window.__brawlDraftFireReadyQA?.()?.canShoot,
    null,{timeout:12000});
  assert.equal(await red1.evaluate(()=>window.__brawlDraftFireQA(Math.PI)),true,
    'real opponent shoots once through a clear lane at the decoy');
  let holoDissolve=null,lastHoloShot=null;
  const dissolveDeadline=Date.now()+13000;
  while(Date.now()<dissolveDeadline){
    const g=await committedGame(code);
    lastHoloShot={count:g?.draftCardStats?.gad2HologramsDissolved||0,
      holograms:Object.keys(g?.gad2Holograms||{}),
      hpOwner:g?.hp?.[blueId],hpEnemy:g?.hp?.[redId],phase:g?.phase};
    if(lastHoloShot.count===1&&lastHoloShot.holograms.length===0&&
       lastHoloShot.phase==='playing'){holoDissolve=g;break;}
    await new Promise(resolve=>setTimeout(resolve,170));
  }
  assert(holoDissolve,'one real enemy firing action must dissolve exactly one decoy: '+
    JSON.stringify(lastHoloShot));
  assert.equal(holoDissolve.hp[blueId],realOwnerHp,
    'destroying a decoy cannot damage the real owner');
  assert.equal(holoDissolve.hp[redId],realEnemyHp,
    'decoy shot and explosion must never damage the attacker');
  await Promise.all(clients.map(c=>c.page.waitForFunction(()=>{
    const q=window.__brawlDraftGad2QA?.();
    return q&&!q.holograms.blue1&&q.holoDissolves===1;
  },null,{timeout:12000})));
  console.log('PASS LIVE GAD2 hologram: 4 WebKit, autonomous movement, fake bullets zero HP/ULT, ally-only mark, enemy volley one-hit dissolve');

  // Genuine connection teardown/resume: use RTDB goOffline() to trigger the
  // SDK's onDisconnect presence cleanup, then reload the SAME Safari tab,
  // preserving sessionStorage identity. No direct fixture deletion of presence.
  const red2=bySeat.red2;
  const red2Before=await get(red2);
  assert.equal(red2Before.seat,'red2','choose nonhost for reconnect trial');
  const beforeDisconnect=await committedGame(code);
  assert.equal(beforeDisconnect.phase,'playing');
  const formerConnection=red2Before.connectionId;
  assert(formerConnection,'participant must have an active Firebase presence token');
  await red2.evaluate(()=>window.firebase.database().goOffline());
  await host.waitForFunction(()=>window.__brawlV3QA?.()?.online===3,
    null,{timeout:12000});
  await host.waitForFunction(()=>window.__brawlV3QA?.()?.game==='paused',
    null,{timeout:12000});
  const stopped=await committedGame(code);
  assert.equal(stopped.phase,'paused','server must pause actual combat when one device leaves');
  assert.equal(stopped.pausedFrom,'playing','pause remembers combat phase');
  const freezeClock=stopped.clock.t;
  await new Promise(resolve=>setTimeout(resolve,250));
  const frozen=await committedGame(code);
  assert.equal(frozen.clock.t,freezeClock,'combat clock cannot advance in paused phase');
  await red2.reload({waitUntil:'domcontentloaded'});
  await red2.waitForFunction(()=>typeof window.__brawlV3QA==='function',
    null,{timeout:12000});
  await red2.locator('#roomInput').fill(code);
  await red2.locator('#joinBtn').click();
  await red2.waitForFunction(({id,room})=>{
    const q=window.__brawlV3QA?.();
    return q?.myId===id&&q.seat==='red2'&&q.roomId===room&&
      !!q.connectionId;
  },{id:red2Before.myId,room:code},{timeout:17000});
  await host.waitForFunction(()=>{const q=window.__brawlV3QA?.();
    return q?.online===4&&q?.game==='playing'&&q?.round===5&&
      !q.paused&&q.hostAuthorized;},null,{timeout:22000});
  const resumed=await committedGame(code);
  assert.equal(resumed.phase,'playing');
  assert.equal(resumed.round,5);
  assert.equal(resumed.scores.blue,beforeDisconnect.scores.blue);
  assert.equal(resumed.scores.red,beforeDisconnect.scores.red);
  assert.equal(resumed.seats.red2.id,red2Before.myId,
    'reconnect MUST resume the old seat, not replace it with a fifth player');
  const red2After=await get(red2);
  assert.notEqual(red2After.connectionId,formerConnection,
    'reconnected WebKit client owns a fresh connection token');
  assert.deepEqual(red2After.draft.owned.red2,beforeDisconnect.draft.owned.red2,
    'draft loadout remains unchanged through genuine WebKit socket drop');
  await Promise.all(clients.map(c=>c.page.waitForFunction(()=>{
    const q=window.__brawlV3QA?.();
    return q?.online===4&&q?.game==='playing'&&q?.round===5;
  },null,{timeout:16000})));
  console.log('PASS LIVE disconnect/resume: RTDB onDisconnect, shared pause frozen clock, same seat and cards, four-WebKit match resume');

  // A restored seat must be functional, not merely present in the roster:
  // prove a new-position packet and a NEW, host-accepted normal shot arrive
  // under the new connection token. Read only committed emulator REST data.
  assert((resumed.hp?.[red2Before.myId]||0)>0,
    'rejoining live player must still be alive to test post-reconnect combat');
  await red2.waitForFunction(()=>window.__brawlDraftFireReadyQA?.()?.canShoot,
    null,{timeout:16000});
  const red2Move={id:red2Before.myId,token:red2After.connectionId,x:970,y:500};
  assert.equal(await red2.evaluate(({x,y})=>window.__brawlDraftMoveQA(x,y),red2Move),true,
    'restored seat can move through existing local combat input');
  await host.waitForFunction(({id,token,x,y})=>{
    const p=window.__brawlV3QA?.()?.positionValues?.[id];
    return p?.connectionId===token&&Math.abs(p.x-x)<3&&Math.abs(p.y-y)<3;
  },red2Move,{timeout:16000});
  const beforeRejoinShot=await committedGame(code);
  const oldSeq=beforeRejoinShot.stats[red2Before.myId].lastActionSeq||0;
  assert.equal(await red2.evaluate(()=>window.__brawlDraftFireQA(Math.PI/2)),true,
    'restored participant can submit a real attack');
  let rejoinShot=null;
  const rejoinDeadline=Date.now()+12000;
  while(Date.now()<rejoinDeadline){
    const g=await committedGame(code);
    if((g?.stats?.[red2Before.myId]?.lastActionSeq||0)>oldSeq&&
      Object.values(g?.usedActions||{}).some(a=>
        a.owner===red2Before.myId&&a.type==='shot'&&a.seq>oldSeq&&a.status==='accepted')){
      rejoinShot=g;break;
    }
    await new Promise(resolve=>setTimeout(resolve,150));
  }
  assert(rejoinShot,'new connection must receive an accepted, server-committed attack receipt');
  console.log('PASS LIVE resumed seat: fresh-token movement observed by host and normal shot accepted');

  // An extra Safari context presenting a stolen/stale session seat ID must
  // NEVER attach as a fifth player or take over the currently active seat.
  const intruder=await client(browser,4);
  clients.push(intruder);
  await intruder.page.evaluate(({room,id})=>
    sessionStorage.setItem('brawl-v3-2v2-seat-'+room,id),
    {room:code,id:red2Before.myId});
  await intruder.page.locator('#roomInput').fill(code);
  await intruder.page.locator('#joinBtn').click();
  await intruder.page.waitForFunction(()=>
    document.getElementById('homeStatus')?.textContent?.includes('参加失敗'),
    null,{timeout:14000});
  const intruderState=await get(intruder.page);
  assert.equal(intruderState.roomId,'','fifth client must not join full match');
  assert.equal(intruderState.seat,null,'active red2 identity cannot be stolen');
  assert.equal((await get(host)).online,4,'duplicate attempt leaves four legitimate seats online');
  assert.equal((await get(host)).lobby.seats.red2.id,red2Before.myId);
  console.log('PASS LIVE duplicate join: active session identity rejected, four seats preserved');

  // Host interruption: other clients pause (and do NOT become owner), then
  // the original owner resumes the same seat and takes a fresh host token.
  const hostBefore=await get(host),beforeHostDrop=await committedGame(code);
  assert.equal(hostBefore.seat,'blue1');
  assert.equal(beforeHostDrop.phase,'playing');
  await host.evaluate(()=>window.firebase.database().goOffline());
  await red2.waitForFunction(()=>window.__brawlV3QA?.()?.online===3,
    null,{timeout:14000});
  await red2.waitForFunction(()=>window.__brawlV3QA?.()?.game==='paused',
    null,{timeout:14000});
  const hostPaused=await committedGame(code);
  assert.equal(hostPaused.phase,'paused');
  assert.equal(hostPaused.pausedFrom,'playing');
  for(const peer of [bySeat.blue2,bySeat.red1,bySeat.red2])
    assert.equal((await get(peer)).hostAuthorized,false,
      'non-owners cannot seize authority after host disconnect');
  await new Promise(resolve=>setTimeout(resolve,260));
  assert.equal((await committedGame(code)).clock.t,hostPaused.clock.t,
    'host outage freezes the shared combat clock');
  await host.reload({waitUntil:'domcontentloaded'});
  await host.waitForFunction(()=>typeof window.__brawlV3QA==='function',
    null,{timeout:12000});
  await host.locator('#roomInput').fill(code);
  await host.locator('#joinBtn').click();
  await host.waitForFunction(({id,room})=>{
    const q=window.__brawlV3QA?.();
    return q?.myId===id&&q?.seat==='blue1'&&q?.roomId===room&&!!q.connectionId;
  },{id:hostBefore.myId,room:code},{timeout:17000});
  await host.waitForFunction(()=>{
    const q=window.__brawlV3QA?.();
    return q?.online===4&&q?.game==='playing'&&q?.round===5&&
      q.hostAuthorized&&q.gameHostToken===q.connectionId;
  },null,{timeout:22000});
  const newHost=await get(host),hostRestored=await committedGame(code);
  assert.notEqual(newHost.connectionId,hostBefore.connectionId,
    'host must not reuse its disconnected authority token');
  assert.equal(hostRestored.hostToken,newHost.connectionId);
  assert.equal(hostRestored.phase,'playing');
  assert.equal(hostRestored.round,beforeHostDrop.round);
  assert.deepEqual(hostRestored.scores,beforeHostDrop.scores);
  assert.equal(hostRestored.hp[hostBefore.myId],beforeHostDrop.hp[hostBefore.myId]);
  assert.deepEqual(hostRestored.draft.owned.blue1,beforeHostDrop.draft.owned.blue1);
  await Promise.all(bySeat.red2===host?[host]:[bySeat.blue2,bySeat.red1,bySeat.red2].map(p=>
    p.waitForFunction(()=>window.__brawlV3QA?.()?.game==='playing'&&
      window.__brawlV3QA?.()?.online===4,null,{timeout:16000})));
  console.log('PASS LIVE host recovery: peers pause, no authority hijack, new host token, same combat and cards');


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
