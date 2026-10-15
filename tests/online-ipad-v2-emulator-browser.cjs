// Run REAL browser clients against a LOCAL RTDB emulator. No cloud, deploy, or real credentials.
'use strict';
const fs=require('node:fs'),http=require('node:http'),assert=require('node:assert/strict'),path=require('node:path');
const {webkit}=require('playwright-core');
if(!/^(127\.0\.0\.1|localhost):9000$/.test(process.env.FIREBASE_DATABASE_EMULATOR_HOST||''))throw Error('LOCAL Firebase RTDB emulator required');
const root=path.resolve(__dirname,'..'),sdk=path.join(root,'artifacts','firebase-sdk'),url='https://demo-brawl-online-default-rtdb.firebaseio.com';
const ports=8765, errors=[];
const specs=[
 {mode:'duel',file:'online/ipad-duel-v2-lab.html',qa:'__brawlV29QA',stage:'#appStage',joinPanel:'#openJoinPanel',hostLabel:'#lobbyStatus',startLabel:'playing',codeSelector:'#roomCode'},
 {mode:'squad',file:'online/ipad-squad-v2-lab.html',qa:'__brawlV3QA',stage:'#app',joinPanel:null,hostLabel:'#homeStatus',startLabel:'playing',codeSelector:'#roomCode'}
];
function patched(spec){
 let src=fs.readFileSync(path.join(root,spec.file),'utf8');
 const origin=spec.mode==='duel'?'    db=firebase.database();':' db=firebase.database();';
 assert.equal(src.split(origin).length-1,1,'Firebase SDK creation hook '+spec.mode);
 src=src.replace(origin,origin+'\n'+(spec.mode==='duel'?'    ':' ')+"db.useEmulator('127.0.0.1',9000);");
 src=src.replace('connect-src ', 'connect-src http://127.0.0.1:9000 ws://127.0.0.1:9000 ');
 assert(src.includes("db.useEmulator('127.0.0.1',9000)"));
 return src;
}
const htmls=Object.fromEntries(specs.map(s=>[s.mode,patched(s)]));
const server=http.createServer((req,res)=>{
 const mode=req.url==='/duel'?'duel':req.url==='/squad'?'squad':null;
 if(!mode){res.writeHead(404);res.end('not found');return;}
 res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});
 res.end(htmls[mode]);
});
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function context(browser,mode,who){
 const ctx=await browser.newContext({viewport:{width:1024,height:620},hasTouch:true,isMobile:true,deviceScaleFactor:1,locale:'ja-JP'});
 const page=await ctx.newPage();
 const issues=[];
 page.on('pageerror',e=>issues.push('JS '+String(e.message)));
 page.on('console',m=>{if(m.type()==='error')issues.push('console '+m.text().slice(0,240));});
 await page.route('https://www.gstatic.com/firebasejs/10.8.0/*',async route=>{
  const name=route.request().url().split('/').pop();
  const file=path.join(sdk,name);
  if(!['firebase-app-compat.js','firebase-database-compat.js'].includes(name)||!fs.existsSync(file))return route.abort();
  return route.fulfill({status:200,contentType:'application/javascript',body:fs.readFileSync(file)});
 });
 await page.goto('http://127.0.0.1:'+ports+'/'+mode,{waitUntil:'load'});
 await page.waitForFunction(key=>typeof window[key]==='function',specs.find(x=>x.mode===mode).qa);
 await page.locator('details.online-config summary').click();
 await page.locator('#onlineDbInput').fill(url);
 return {ctx,page,issues,who};
}
async function snap(client,spec){return client.page.evaluate(k=>window[k](),spec.qa);}
async function waitState(client,spec,fn,timeout=20000){
 await client.page.waitForFunction(({k,matcher})=>{
  const q=window[k]?.(); if(!q)return false;
  if(matcher==='room')return /^\d{5}$/.test(q.roomId||'');
  if(matcher==='game')return (q.game?.phase||q.game)==='playing'&&(q.scene==='game');
  if(matcher==='select')return q.scene==='select';
  if(matcher==='lobby')return q.scene==='lobby';
  return false;
 },{k:spec.qa,matcher:fn},{timeout});
}
async function hostRoom(client,spec){
 await client.page.locator('#createBtn').click();
 await waitState(client,spec,'room');
 const q=await snap(client,spec);
 assert(/^\d{5}$/.test(q.roomId)); return q.roomId;
}
async function guestRoom(client,spec,id,bot){
 if(spec.joinPanel)await client.page.locator(spec.joinPanel).click();
 await client.page.locator('#roomInput').fill(id);
 await client.page.locator(bot?'#joinBotBtn':'#joinBtn').click();
 await delay(1200);
 if(spec.mode==='squad')console.log('SQUAD JOIN ATTEMPT '+id+' : '+(await client.page.locator('#homeStatus').innerText()));
 await waitState(client,spec,'room',11000);
}
async function startMatch(clients,spec,botIndex){
 for(const [i,c] of clients.entries()){
  if(i===botIndex)continue;
  await c.page.locator('#readyBtn').click();
  await delay(170);
 }
 for(const c of clients)await waitState(c,spec,'game',32000);
 const qs=await Promise.all(clients.map(c=>snap(c,spec)));
 assert(qs.every(q=>(q.game?.phase||q.game)==='playing'));
 if(spec.mode==='duel')assert(qs.every(q=>q.game?.round===1&&q.game?.hp?.host===160),'duel HP must use Tank 160');
 else assert(qs.every(q=>q.online===4&&q.game==='playing'&&q.combat&&q.combat.hp),'squad four-seat combat');
 return qs;
}
async function run(browser,spec,count,botIndex=-1){
 const clients=[];
 try{
  for(let i=0;i<count;i++)clients.push(await context(browser,spec.mode,'client'+i));
  const id=await hostRoom(clients[0],spec);
  for(let i=1;i<count;i++)await guestRoom(clients[i],spec,id,i===botIndex);
  for(const c of clients){if(spec.mode==='duel')await waitState(c,spec,'select');else await waitState(c,spec,'lobby');}
  await startMatch(clients,spec,botIndex);
  console.log('PASS '+spec.mode+' '+count+' clients'+(botIndex>0?' with BOT guest':'')+': ONLINE room '+id+' all connected, READY, game start; Tank 160 when applicable');
  if(spec.mode==='duel'&&botIndex<0){
   const shooter=clients[0],other=clients[1];
   const startAt=(await snap(shooter,spec)).game.startAt;
   await delay(Math.max(200,Math.min(5000,startAt-Date.now()+350)));
   const before=(await snap(other,spec)).remote?.targetX,hostBefore=(await snap(shooter,spec)).local.x;
   await shooter.page.keyboard.down('d');await delay(620);await shooter.page.keyboard.up('d');
   const hostAfter=(await snap(shooter,spec)).local.x;
   assert(hostAfter>hostBefore+5,'actual local keyboard movement must work: '+hostBefore+' to '+hostAfter);
   await other.page.waitForFunction(({key,x})=>window[key]?.()?.remote?.targetX>x+5,{key:spec.qa,x:before},{timeout:9000});
   const after=(await snap(other,spec)).remote?.targetX;
   assert(after>before+5,'real RTDB position update must arrive at other browser');
   console.log('PASS duel remote position replicated to second WebKit tab: x '+before+' -> '+after);
  }
  if(spec.mode==='squad'){
   const shooter=clients[0],observer=clients[1],q=await snap(shooter,spec);
   assert.equal(Object.keys(q.combat.stats).length,4);
   assert(q.stats&&q.combat.matchId,'four authoritative players');
   const hostId=q.myId,before=q.stats[hostId].lastActionSeq;
   const startupWait=Math.max(250,Math.min(3500,q.combat.startAt-Date.now()+450));
   await delay(startupWait);
   const shotSentAt=Date.now();
   await shooter.page.locator('#arena').tap({position:{x:730,y:290},timeout:5000});
   await shooter.page.waitForFunction(({k,id,seq})=>window[k]?.()?.stats?.[id]?.lastActionSeq>seq,{k:spec.qa,id:hostId,seq:before},{timeout:10000});
   const hostAckMs=Date.now()-shotSentAt;
   await observer.page.waitForFunction(({k,id,seq})=>window[k]?.()?.stats?.[id]?.lastActionSeq>seq,{k:spec.qa,id:hostId,seq:before},{timeout:10000});
   const peerAckMs=Date.now()-shotSentAt;
   console.log('PASS squad 4 participants: touch shot authoritative ack '+hostAckMs+'ms, other-client ack '+peerAckMs+'ms (local RTDB emulator, not real network RTT)');
   // Verify four real clients can submit near-concurrent shots; all receipts must
   // survive the host's bounded batch transaction and appear on every client.
   await delay(450);
   const initial=await Promise.all(clients.map(c=>snap(c,spec)));
   const shots=initial.map(q=>({id:q.myId,seq:q.stats[q.myId].lastActionSeq}));
   await Promise.all(clients.map(c=>c.page.locator('#arena').tap({position:{x:730,y:290},timeout:5000})));
   await shooter.page.waitForFunction(({key,expected})=>{const q=window[key]?.();return !!q?.stats&&expected.every(p=>q.stats[p.id]?.lastActionSeq>p.seq);},{key:spec.qa,expected:shots},{timeout:16000});
   await observer.page.waitForFunction(({key,expected})=>{const q=window[key]?.();return !!q?.stats&&expected.every(p=>q.stats[p.id]?.lastActionSeq>p.seq);},{key:spec.qa,expected:shots},{timeout:16000});
   console.log('PASS squad 4 near-concurrent real-client shots: all four player action sequences accepted and replicated');

   // Real browser gameplay + local Firebase emulator: warp one attacker and
   // defender into range, then fire through the UI and assert actual host HP.
   // This touches ONLY the local test RTDB, never the user's production room.
   const readyQs=await Promise.all(clients.map(c=>snap(c,spec)));
   const targetIndex=readyQs.findIndex((v,i)=>i>0&&v.seat?.startsWith('red'));
   assert(targetIndex>0,'opposing red-team human client available for damage test');
   const victimId=readyQs[targetIndex].myId,attackerId=readyQs[0].myId;
   const combat=readyQs[0].combat;
   assert.equal(combat.phase,'playing','battle must still be active for damage E2E');
   const moves={
    [attackerId]:{rev:combat.motions[attackerId].rev+1,x:700,y:540,a:0},
    [victimId]:{rev:combat.motions[victimId].rev+1,x:760,y:540,a:Math.PI}
   };
   await shooter.page.evaluate(async ({roomId,motions})=>{
    await window.firebase.database().ref('rooms2v2/'+roomId+'/game/motions').update(motions);
   },{roomId:id,motions:moves});
   await shooter.page.waitForFunction(({k})=>Math.abs((window[k]?.()?.local?.x||0)-700)<5,{k:spec.qa},{timeout:9000});
   await clients[targetIndex].page.waitForFunction(({k})=>Math.abs((window[k]?.()?.local?.x||0)-760)<5,{k:spec.qa},{timeout:9000});
   await shooter.page.waitForFunction(({k,victim})=>{
    const p=window[k]?.()?.positionValues?.[victim];
    return !!p&&Math.abs(p.x-760)<5;
   },{k:spec.qa,victim:victimId},{timeout:9000});
   const hpBefore=(await snap(shooter,spec)).hp[victimId];
   assert(hpBefore>0,'opposing human must be alive and damageable');
   const attackerBefore=(await snap(shooter,spec)).stats[attackerId].lastActionSeq;
   const beforeInfo=await snap(shooter,spec);
   console.log('HP DAMAGE SETUP '+JSON.stringify({mode:beforeInfo.mode,hostChar:beforeInfo.stats[attackerId]?.char,ammo:beforeInfo.stats[attackerId]?.ammo,victimId,hpBefore,hostPosition:beforeInfo.local,victimPosition:beforeInfo.positionValues[victimId],gameClock:beforeInfo.combat?.clock,hostSeat:beforeInfo.seat}));
   await shooter.page.locator('#arena').tap({position:{x:730,y:290},timeout:5000});
   await shooter.page.waitForFunction(({k,attacker,seq})=>(window[k]?.()?.stats?.[attacker]?.lastActionSeq??0)>seq,
    {k:spec.qa,attacker:attackerId,seq:attackerBefore},{timeout:10000});
   await delay(1000);
   const afterInfo=await snap(shooter,spec);
   console.log('HP DAMAGE SHOT '+JSON.stringify({hostAmmo:afterInfo.stats[attackerId]?.ammo,hostHP:afterInfo.hp[attackerId],victimHP:afterInfo.hp[victimId],hostPosition:afterInfo.local,victimPosition:afterInfo.positionValues[victimId],projectiles:afterInfo.combat?.projectiles,events:afterInfo.combat?.events,usedActions:afterInfo.combat?.usedActions,combatClock:afterInfo.combat?.clock}));
   try{
    await shooter.page.waitForFunction(({k,victim,hp})=>(window[k]?.()?.hp?.[victim]??Infinity)<hp,
      {k:spec.qa,victim:victimId,hp:hpBefore},{timeout:8000});
   }catch(err){
    for(const [ix,c] of clients.entries()){
     const q=await snap(c,spec);
     console.error('DAMAGE TIMEOUT '+ix+' '+JSON.stringify({
      hostAuthorized:q.hostAuthorized,combatReady:q.combatReadyNow,hostTimerActive:q.hostTimerActive,hostTimerPulses:q.hostTimerPulses,combatTickCalls:q.combatTickCalls,combatTickSkips:q.combatTickSkips,combatTickResults:q.combatTickResults,
      combatBusy:q.combatBusy,hostProcessing:q.hostProcessing,hostActionDispatchQueued:q.hostActionDispatchQueued,
      hostQueue:q.hostQueue,pendingActionCount:q.pendingActionCount,
      clockLag:q.hostClockLag,clock:q.combat?.clock,rev:q.combat?.combatRev,
      phase:q.game,token:q.gameHostToken,cid:q.connectionId,
      victimHP:q.hp?.[victimId],shots:q.shots,
      projectileIds:Object.keys(q.combat?.projectiles||{}),
      position:q.positionValues?.[victimId],stats:q.stats?.[attackerId]
     }));
    }
    throw err;
   }
   await clients[targetIndex].page.waitForFunction(({k,victim,hp})=>(window[k]?.()?.hp?.[victim]??Infinity)<hp,
    {k:spec.qa,victim:victimId,hp:hpBefore},{timeout:12000});
   const hpAfter=(await snap(clients[targetIndex],spec)).hp[victimId];
   console.log('PASS squad in-range human-shot E2E: authoritative enemy HP '+hpBefore+' -> '+hpAfter+' replicated in both separate browsers');

  }
  for(const c of clients)assert.deepEqual(c.issues.filter(x=>x.startsWith('JS ')),[],'browser runtime '+c.who);
 }catch(error){
  for(const c of clients){
   const q=await snap(c,spec).catch(()=>null);
   const uiStatus=await c.page.locator(spec.mode==='squad'?'#homeStatus':'#lobbyStatus').innerText().catch(()=>'?');
   console.error('STATE '+spec.mode+' '+c.who+' '+JSON.stringify({scene:q?.scene,roomId:q?.roomId,game:q?.game?.phase||q?.game,lobby:q?.lobby?.status,connected:q?.connected,online:q?.online,uiStatus,issues:c.issues.slice(-8)}));
  }
  throw error;
 }finally{for(const c of clients)await c.ctx.close();}
}
(async()=>{
 for(const file of ['firebase-app-compat.js','firebase-database-compat.js'])assert(fs.existsSync(path.join(sdk,file)),'SDK absent: '+file);
 await new Promise(resolve=>server.listen(ports,'127.0.0.1',resolve));
 const browser=await webkit.launch({headless:true});
 try{
  await run(browser,specs[0],2,-1); // two separate humans
  await run(browser,specs[0],2,1);  // player on PC + phone as dedicated BOT
  await run(browser,specs[1],4,-1); // four distinct friends
  console.log('PASS REAL WebKit multi-client RTDB-emulator E2E. LOCAL ONLY, not Internet or school iPad RTT.');
 }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(error=>{console.error(error?.stack||error);server.close();process.exitCode=1;});
