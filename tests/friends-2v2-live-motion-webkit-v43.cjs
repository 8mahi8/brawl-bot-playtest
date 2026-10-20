// V4.3 four MOVING WebKit players and real action-stream shooting.
// Staging HTML and LOCAL Firebase emulator ONLY. Does not test school Wi-Fi.
'use strict';
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {webkit}=require('playwright-core');
const root=path.resolve(__dirname,'..'),sdk=path.join(root,'artifacts/firebase-sdk');
const out=path.join(root,'artifacts/qa'),host='127.0.0.1',port=8893;
const url='https://demo-brawl-draft-beta-default-rtdb.firebaseio.com/';
const SEATS=['blue1','blue2','red1','red2'],DURATION=27;
const order={blue1:['d','d','s','a','a','w','d','s','a'],blue2:['d','d','w','a','a','s','d','w','a'],
 red1:['a','a','s','d','d','w','a','s','d'],red2:['a','a','w','d','d','s','a','w','d']};
if(!/^(127\.0\.0\.1|localhost):9000$/.test(process.env.FIREBASE_DATABASE_EMULATOR_HOST||''))
 throw Error('LOCAL RTDB emulator only');
if(process.env.BRAWL_STAGE_2V2!=='1')throw Error('Generated staging 2v2 only');
function fixture(mode){
 const input=path.join(root,'artifacts/friends-online/'+mode+'-2vs2.html');
 let s=fs.readFileSync(input,'utf8');
 // Existing draft beta has a preconfigured RTDB URL and deliberately hides
 // the connection editor. Redirect that URL to the emulator-only project.
 if(mode==='draft')s=s.replaceAll('https://mygame-df915-default-rtdb.firebaseio.com/',url);
 const a=' db=firebase.database();',b='window.__brawlV3QA=()=>({';
 const listener="watch(room.child('actions'),'child_added',snap=>{const a=snap.val();if(a&&snap.key)acceptAction({...a,eventId:snap.key});});";
 for(const anchor of [a,b,listener])assert.equal(s.split(anchor).length-1,1,'unique '+mode+' anchor');
 s=s.replace(a,a+" db.useEmulator('127.0.0.1',9000);");
 s=s.replace('connect-src ','connect-src http://127.0.0.1:9000 ws://127.0.0.1:9000 ');
 // QA-only readable data and a call into the genuine production shootAngle().
 // Real movement uses the actual keyboard event handlers, not pose mutation.
 const qa=[
 'window.__v43QA=Object.freeze({',
 ' shoot:angle=>{if(!combatReady()||game?.phase!==\'playing\')return false;',
 ' const before=actionSeq;shootAngle(angle);return actionSeq>before;},',
 ' state:()=>({phase:game?.phase,local:{x:local.x,y:local.y},',
 ' remotes:Object.values(remotes).filter(p=>Number.isFinite(p.x)).length,',
 ' bullets:bulletVisuals.size,early:earlyShotStats.incoming,',
 ' frames:workTiming.frameSamples,frameGaps:workTiming.frameGapOver100,',
 ' canvasDrawMs:drawTiming.totalDrawMs,draws:drawTiming.frames})',
 '});'
 ].join('\n');
 s=s.replace(b,qa+'\n'+b);
 // One receiver has callback-only delay. This is NOT a network RTT simulation.
 const callback=[
 'window.__v43DelayQA={ms:0,remoteActions:0};',
 "watch(room.child('actions'),'child_added',snap=>{const a=snap.val();if(!a||!snap.key)return;",
 ' const run=()=>{if(a.owner!==myId&&a.type===\'shot\')window.__v43DelayQA.remoteActions++;',
 ' acceptAction({...a,eventId:snap.key});};',
 ' if(a.owner!==myId&&a.type===\'shot\'&&window.__v43DelayQA.ms)setTimeout(run,window.__v43DelayQA.ms);',
 ' else run();});'
 ].join('\n');
 return s.replace(listener,callback);
}
const pages={'/normal':fixture('normal'),'/draft':fixture('draft')};
const server=http.createServer((req,res)=>{
 const html=pages[req.url];if(!html){res.writeHead(404);res.end();return;}
 res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});res.end(html);
});
async function open(browser,mode,capture){
 const dir=path.join(out,'v43-videos');if(capture)fs.mkdirSync(dir,{recursive:true});
 const settings={viewport:{width:1024,height:650},isMobile:true,hasTouch:true,deviceScaleFactor:1,locale:'ja-JP'};
 if(capture)settings.recordVideo={dir,size:{width:1024,height:650}};
 const ctx=await browser.newContext(settings),page=await ctx.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 page.on('console',e=>{if(e.type()==='error')errors.push(e.text().slice(0,160));});
 await page.route('https://www.gstatic.com/firebasejs/10.8.0/*',async route=>{
  const name=route.request().url().split('/').pop();
  if(!['firebase-app-compat.js','firebase-database-compat.js'].includes(name))return route.abort();
  return route.fulfill({status:200,contentType:'application/javascript',body:fs.readFileSync(path.join(sdk,name))});
 });
 await page.goto('http://'+host+':'+port+'/'+mode,{waitUntil:'load'});
 await page.waitForFunction(()=>!!window.__v43QA&&typeof window.__brawlV3QA==='function',null,{timeout:16000});
 const editor=page.locator('details.online-config summary');
 if(await editor.isVisible()){
  await editor.click();await page.locator('#onlineDbInput').fill(url);
 }else{
  // Draft mode hides this advanced editor; assign its value internally
  // without forcing a nonexistent interactive action.
  await page.locator('#onlineDbInput').evaluate((el,v)=>{el.value=v;},url);
 }
 return {ctx,page,errors,capture};
}
async function key(page,k,pressed){
 await page.evaluate(v=>{
  window.dispatchEvent(new KeyboardEvent(v.pressed?'keydown':'keyup',
   {key:v.k,bubbles:true,cancelable:true}));
 },{k,pressed});
}
async function trial(mode,browser){
 let clients=[],result;
 try{
  clients=await Promise.all(SEATS.map((_,i)=>open(browser,mode,i<2)));
  const first=clients[0].page;
  await first.locator('#createBtn').click();
  await first.waitForFunction(()=>/^\d{5}$/.test(window.__brawlV3QA?.()?.roomId||''),null,{timeout:18000});
  const roomId=(await first.evaluate(()=>window.__brawlV3QA())).roomId;
  for(const c of clients.slice(1)){
   await c.page.locator('#roomInput').fill(roomId);
   await c.page.locator('#joinBtn').click();
   await c.page.waitForFunction(id=>{
    const q=window.__brawlV3QA?.();return q?.roomId===id&&!!q?.seat;
   },roomId,{timeout:17000});
  }
  const joined=await Promise.all(clients.map(c=>c.page.evaluate(()=>window.__brawlV3QA())));
  assert.deepEqual(joined.map(q=>q.seat).sort(),SEATS.slice().sort());
  const bySeat=Object.fromEntries(joined.map((q,i)=>[q.seat,clients[i].page]));
  const chars={blue1:'gunner',blue2:'tank',red1:'sniper',red2:'bomber'};
  for(const seat of SEATS){
   await bySeat[seat].locator('#charPick button[data-char="'+chars[seat]+'"]').click();
   await bySeat[seat].waitForFunction(v=>{
    return window.__brawlV3QA?.()?.lobby?.seats?.[v.seat]?.char===v.char;
   },{seat,char:chars[seat]},{timeout:13000});
  }
  // The receiver with callback delay still sees official game snapshots normally.
  await bySeat.red1.evaluate(()=>{window.__v43DelayQA.ms=180;});
  for(const c of clients)await c.page.locator('#readyBtn').click();
  await Promise.all(clients.map(c=>c.page.waitForFunction(()=>{
   const q=window.__brawlV3QA?.();
   return q?.game==='playing'&&q.scene==='game'&&q.online===4&&q.combatReadyNow;
  },null,{timeout:27000})));
  // iPad legibility: no diagnostic toggle covering the top-center score HUD.
  const ui=await first.evaluate(()=>{
   const d=document.getElementById('brawlV40Open').getBoundingClientRect();
   const score=document.getElementById('roundInfo').getBoundingClientRect();
   const overlap=d.left<score.right&&d.right>score.left&&d.top<score.bottom&&d.bottom>score.top;
   return {buttonTop:d.top,viewportHeight:innerHeight,overlap};
  });
  assert(!ui.overlap&&ui.buttonTop>ui.viewportHeight-65,
   'manual network diagnosis never masks live match score');
  for(const c of clients)await c.page.evaluate(()=>window.__brawlLagV39QA.start());
  const progress=Object.fromEntries(SEATS.map(s=>[s,[]]));
  const shots=Object.fromEntries(SEATS.map(s=>[s,0]));
  const keys=Object.fromEntries(SEATS.map(s=>[s,null]));
  for(let sec=0;sec<DURATION;sec++){
   const index=Math.floor(sec/3);
   await Promise.all(SEATS.map(async seat=>{
    const next=order[seat][index%order[seat].length],page=bySeat[seat];
    if(keys[seat]!==next){
     if(keys[seat])await key(page,keys[seat],false);
     await key(page,next,true);keys[seat]=next;
    }
   }));
   if(sec%2===0){
    await Promise.all(SEATS.map(async seat=>{
     const page=bySeat[seat],angle=(seat.startsWith('blue')?0:Math.PI)+
      (Math.floor(sec/4)%3-1)*.38;
     if(await page.evaluate(a=>window.__v43QA.shoot(a),angle))shots[seat]++;
    }));
   }
   await new Promise(r=>setTimeout(r,1000));
   for(const seat of SEATS)progress[seat].push(await bySeat[seat].evaluate(()=>window.__v43QA.state()));
   if([6,15,24].includes(sec+1)){
    for(const seat of ['blue1','red1'])await bySeat[seat].screenshot({
     path:path.join(out,'v43-'+mode+'-'+seat+'-'+(sec+1)+'s.png')});
   }
  }
  await Promise.all(SEATS.map(seat=>keys[seat]?key(bySeat[seat],keys[seat],false):Promise.resolve()));
  const travel={};
  for(const seat of SEATS){
   const p=progress[seat];let distance=0;
   for(let i=1;i<p.length;i++)distance+=Math.hypot(p[i].local.x-p[i-1].local.x,
    p[i].local.y-p[i-1].local.y);
   travel[seat]=Math.round(distance);
  }
  const reports=await Promise.all(SEATS.map(async seat=>{
   const page=bySeat[seat];
   return {seat,
    visual:await page.evaluate(()=>window.__v43QA.state()),
    latency:await page.evaluate(()=>window.__brawlLagV39QA.stop()),
    received:await page.evaluate(()=>window.__v43DelayQA.remoteActions)};
  }));
  assert(Object.values(travel).filter(x=>x>=90).length>=2,
   'At least two active player trajectories required, not standing still');
  assert(Object.values(shots).reduce((a,b)=>a+b,0)>=7,'actual shot bus must receive seven shots');
  assert(reports.some(r=>r.received>=3),'guests must observe multiple remote action events');
  assert(reports.some(r=>r.visual.remotes>=3),'remote player draw positions must exist');
  for(const c of clients)assert.deepEqual(c.errors,[],'WebKit JS error '+mode);
  result={version:'V4.3',mode,description:'Scripted 4-peer movement and shooting, WebKit/LOCAL RTDB only',
   durationSec:DURATION,shots,travelWorldUnits:travel,characters:chars,
   receiverCallbackOnlyDelayMs:{red1:180},noSchoolNetworkRTT:true,
   peers:reports.map(r=>({seat:r.seat,received:r.received,
    finalFrame:r.visual,lagStages:r.latency.stages,events:r.latency.events}))};
  assert(!JSON.stringify(result).includes(roomId),'anonymous aggregate report only');
  fs.writeFileSync(path.join(out,'v43-'+mode+'-motion.json'),JSON.stringify(result,null,2)+'\n');
  console.log('PASS V4.3 '+mode+' moving multiplayer '+JSON.stringify({shots,travel}));
  return result;
 }finally{
  await Promise.allSettled(clients.map(c=>c.ctx.close()));
  for(let i=0;i<clients.length;i++)if(clients[i].capture){
   const filename=path.join(out,'v43-'+mode+'-'+(i?'guest':'host')+'.webm');
   await clients[i].page.video().saveAs(filename);
   assert(fs.statSync(filename).size>1000,'capture nonempty '+filename);
   console.log('CAPTURE '+path.basename(filename));
  }
 }
}
async function main(){
 fs.mkdirSync(out,{recursive:true});
 await new Promise(resolve=>server.listen(port,host,resolve));
 let browser;
 try{
  browser=await webkit.launch({headless:true});
  for(const mode of ['normal','draft'])await trial(mode,browser);
  console.log('PASS V4.3 two live-motion 27s 4-peer trials');
 }finally{
  if(browser)await browser.close();
  await new Promise(resolve=>server.close(resolve));
 }
}
main().catch(e=>{console.error(e);process.exitCode=1;});
