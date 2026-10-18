// Headless WebKit verification of isolated, browser-playable offline Tactical Draft BOT.
'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {webkit}=require('playwright-core');
const root=path.resolve(__dirname,'..');
const pageFile='file://'+path.join(root,'sites/BRAWL_DRAFT_BOT_PLAYTEST.html');
const code=fs.readFileSync(path.join(root,'sites/BRAWL_DRAFT_BOT_PLAYTEST.html'),'utf8');
const extra=fs.readFileSync(path.join(root,'draft/duel-bot-playstyle-extras.inc.js'),'utf8');
const old=fs.readFileSync(path.join(root,'online/draft-duel-lab.html'),'utf8');
for(const card of ['split_round','ricochet','recoil_shot','delayed_blast','portable_wall','trap_mine','hologram','warp_beacon','smoke'])
 assert(code.includes("id:'"+card+"'"),card+' not in standalone file');
assert(code.includes(extra),'playstyle addon must be fully inlined in standalone artifact');
assert(!old.includes(extra),'do not modify the older BOT draft prototype');
assert.equal(fs.readFileSync(path.join(root,'sites/BRAWL_FRIENDS_1vs1.html'),'utf8').includes('extraGadgetBtn'),false);
assert.equal(fs.readFileSync(path.join(root,'sites/BRAWL_FRIENDS_2vs2.html'),'utf8').includes('extraGadgetBtn'),false);
let browser,context;
async function play(deck,char='tank'){
 const page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push('JS '+e.message));
 page.on('console',msg=>{if(msg.type()==='error')errors.push('Console '+msg.text().slice(0,180));});
 await page.goto(pageFile);
 await page.waitForFunction(()=>typeof window.__brawlPlaystyleQA==='function');
 await page.locator('#soloBtn').click();
 await page.locator('#extraPickBtn').click();
 for(const id of deck)await page.locator('input[data-extra-id="'+id+'"]').check();
 await page.locator('#extraPickDone').click();
 if(char!=='tank')await page.locator('button[data-char="'+char+'"]').click();
 await page.locator('#readyBtn').click();
 await page.waitForFunction(()=>window.__brawlDraftQA?.()?.phase==='playing',null,{timeout:12000});
 await page.waitForFunction(()=>Date.now()>=window.__brawlV29QA?.()?.game?.startAt+50,null,{timeout:10000});
 const QA=await page.evaluate(()=>({draft:window.__brawlDraftQA(),play:window.__brawlPlaystyleQA()}));
 assert.deepEqual(QA.draft.owned.host,deck);
 assert.equal(QA.play.cards.length,9);
 return {page,errors,QA};
}
async function run(){
 browser=await webkit.launch({headless:true});
 context=await browser.newContext({viewport:{width:1100,height:700},isMobile:true,hasTouch:true});
 try{
  for(const [card,key] of [['portable_wall','wall'],['trap_mine','mines'],
    ['hologram','holo'],['warp_beacon','beacons'],['smoke','smoke']]){
    const x=await play([card]);
    assert.equal(await x.page.locator('#extraGadgetBtn').isVisible(),true,'GAD2 visible '+card);
    await x.page.locator('#extraGadgetBtn').click();
    const s=await x.page.evaluate(()=>window.__brawlPlaystyleQA().state);
    assert((key==='beacons'?!!s.beacons.host:s[key].length===1),'GAD2 must create '+card);
    if(card==='hologram'){
      const h=s.holo[0];
      assert(h.until-Date.now()>5000&&h.until-Date.now()<=7100,'7 second hologram lifetime');
    }
    assert.deepEqual(x.errors,[],'browser errors '+card);
    await x.page.close();
  }
  const gunner=await play(['split_round','recoil_shot','delayed_blast'],'gunner');
  assert.equal((await gunner.page.evaluate(()=>window.__brawlPlaystyleQA().owned.host)).length,3);
  // Fire a real Gunner volley: check one recoil impulse and actual split children.
  const before=await gunner.page.evaluate(()=>window.__brawlV29QA().local.x);
  assert.equal(await gunner.page.evaluate(()=>window.__brawlPlaystyleQA().fire(0)),true);
  const after=await gunner.page.evaluate(()=>window.__brawlV29QA().local.x);
  assert(before-after>=17&&before-after<=25,'recoil must be one short backward move, not three impulses');
  await gunner.page.waitForFunction(()=>window.__brawlV29QA().shots.some(s=>s.splitChild),null,{timeout:3500});
  assert.deepEqual(gunner.errors,[]);
  await gunner.page.close();
  console.log('PASS WebKit: solo match setup, 3-card selectable loadout, 5 different GAD2 effects, 7s hologram, 9-card registry, normal release isolation');
 }finally{await context.close();await browser.close();}
}
run().catch(e=>{console.error(e);process.exitCode=1;});
