// KO spectator regression: bot must continue thinking/moving after human is KO,
// even when every surviving opponent is concealed. Test-only accessors are
// injected into the iframe source; they do not ship in the Google Sites HTML.
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {webkit}=require('playwright-core');
const html=fs.readFileSync(path.resolve(__dirname,'../sites/2vs2-ipad-ko-scout-v1.html'),'utf8');
const probe=`
window.__brawlKoScoutProbe=()=>{
 if(!game||!lobby||game.phase!=='playing')throw Error('match not ready');
 const g=structuredClone(game),bot=g.seats.blue2.id,e1=g.seats.red1.id,e2=g.seats.red2.id;
 g.hp[myId]=0;g.reveals={};g.protection={};
 const place=(id,x,y)=>({x,y,a:0,vx:0,vy:0,life:g.stats[id].life,motionRev:g.motions[id].rev,matchId:g.matchId,round:g.round});
 const p={};
 // Use traversable tile: the old nominal center goal (876,715) lies inside a KO wall.
 p[bot]=place(bot,940,700);
 p[e1]=place(e1,1210,155);
 p[e2]=place(e2,1380,155);
 const actor={...p[bot]},plans=[];let brain={};
 for(const t of [10000,14500,19000]){
  g.clock.t=t;g.startAt=0;
  const plan=botEngines.ko.decide({game:g,positions:p,owner:bot,actor,level:'normal',brain,wallNow:Date.now()});
  plans.push({targetId:plan.targetId,tactic:plan.brain.tactic,goal:plan.brain.goal,move:plan.move});
  brain=plan.brain;
 }
 return plans;
};
window.__brawlKoKillHuman=()=>room.child('game').transaction(g=>{
 if(!g||g.phase!=='playing')return;
 return {...g,hp:{...g.hp,[myId]:0}};
},undefined,false);
`;
assert.equal(html.split('window.__brawlV3QA=()=>').length,2,'diagnostic injection anchor');
const source=html.replace('window.__brawlV3QA=()=>',probe+'window.__brawlV3QA=()=>');
(async()=>{
 const browser=await webkit.launch({headless:true});
 try{
  const ctx=await browser.newContext({viewport:{width:1024,height:620},isMobile:true,hasTouch:true,deviceScaleFactor:2,locale:'ja-JP'});
  const page=await ctx.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.setContent('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body></body></html>');
  await page.evaluate(src=>{
   const frame=document.createElement('iframe');
   frame.setAttribute('sandbox','allow-scripts');
   frame.style.cssText='position:fixed;inset:0;width:100%;height:100%;border:0';
   document.body.style.margin='0';document.body.appendChild(frame);frame.srcdoc=src;
  },source);
  const f=page.frameLocator('iframe');
  await f.locator('#soloBtn').tap({timeout:15000});
  await f.locator('#readyBtn').tap({timeout:15000});
  await f.locator('#app[data-scene="game"]').waitFor({timeout:25000});
  await page.waitForFunction(()=>document.querySelector('iframe')?.contentDocument===null||true);
  await f.locator('#app').evaluate(async()=>{
   for(let n=0;n<30;n++){
    if(window.__brawlV3QA?.()?.game==='playing'&&window.__brawlKoScoutProbe)return;
    await new Promise(r=>setTimeout(r,100));
   }
   throw Error('KO match failed to start');
  });
  const plans=await f.locator('#app').evaluate(()=>window.__brawlKoScoutProbe());
  console.log('SCOUT-PLANS '+JSON.stringify(plans));
  assert.equal(plans.length,3);
  for(const p of plans){
   assert.equal(p.targetId,null,'hidden enemies must NOT be revealed to bot');
   assert.equal(p.tactic,'scout','KO bot should actively scout unknown positions');
   assert(Math.hypot(p.move.dx,p.move.dy)>.3,'KO bot must move from former idle location');
  }
  assert.notDeepEqual(plans[0].goal,plans[1].goal,'scout waypoint should rotate over time');
  assert.notDeepEqual(plans[1].goal,plans[2].goal,'scout should continue patrolling');
  const before=await f.locator('#app').evaluate(()=>window.__brawlV3QA());
  await f.locator('#app').evaluate(()=>window.__brawlKoKillHuman());
  await page.waitForTimeout(2300);
  const after=await f.locator('#app').evaluate(()=>window.__brawlV3QA());
  assert.equal(after.hp[after.myId],0,'human must be knocked out');
  assert.equal(after.game,'playing','remaining bots should keep the KO round alive');
  assert(after.combat.combatRev>before.combat.combatRev,'combat host must advance after human death');
  assert(Object.keys(after.botActors).length>=3,'all 3 BOT actors should still be updating');
  assert.deepEqual(errors,[],'unexpected WebKit JS errors');
  console.log('PASS KO spectator: human HP=0, combat progresses, 3 bot actors remain; concealed enemies lead to patrol not permanent idle');
  await ctx.close();
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
