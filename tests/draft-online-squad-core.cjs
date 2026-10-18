// Squad Tactical Draft: static and deterministic transaction contracts, no cloud.
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const root=path.resolve(__dirname,'..'),src=fs.readFileSync(path.join(root,'draft/squad-online-prototype.inc.js'),'utf8');
const html=fs.readFileSync(path.join(root,'online/draft-squad-online-lab.html'),'utf8');
assert(html.includes(src),'Standalone squad HTML inlines pure draft reducer verbatim');
for(const [i,m] of [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].entries())
 if(m[1].trim())new vm.Script(m[1],{filename:'draft-squad-lab#'+i});
const names=['squadNewMatch','squadHand','squadOrder','squadOffer','squadBegin','squadPick','squadNextRound','squadDamage','squadMoveFactor','squadReloadFactor','squadBlastAuthorize'];
const api=vm.runInNewContext(src+'\n({'+names.join(',')+'})',{},{timeout:2000});
const {squadNewMatch,squadHand,squadOrder,squadOffer,squadBegin,squadPick,squadNextRound,squadDamage,squadMoveFactor,squadReloadFactor,squadBlastAuthorize}=api;
const seats=['blue1','blue2','red1','red2'];
assert.deepEqual(Array.from(squadOrder('blue',0)),['blue1','red1','red2','blue2']);
assert.deepEqual(Array.from(squadOrder('blue',1)),['blue2','red2','red1','blue1']);
assert.deepEqual(Array.from(squadOrder('red',0)),['red1','blue1','blue2','red2']);
assert.deepEqual(Array.from(squadOrder('red',1)),['red2','blue2','blue1','red1']);
const asPlain=o=>JSON.parse(JSON.stringify(o));
let game={phase:'playing',mode:'ko',round:1,winner:null,endedAt:0,
 scores:{blue:0,red:0},draft:squadNewMatch()};
for(let round=1;round<=4;round++){
 const winner=round%2?'blue':'red';
 game={...game,phase:'round_end',round,winner,scores:{blue:Math.ceil(round/2),red:Math.floor(round/2)}};
 const state=squadBegin(game,'12345');
 assert(state?.phase==='draft');
 assert.equal(state.draft.order[0],squadOrder(winner,round-1)[0]);
 assert.equal(squadBegin(state,'12345'),null,'cannot begin already-active draft');
 assert.equal(squadPick(state,state.draft.order[1],state.draft.offered[0]),null,'cannot steal first pick');
 let cur=state;
 const before=JSON.stringify(state);
 for(const seat of state.draft.order){
  const owned=squadHand(cur.draft,seat);
  const taken=cur.draft.taken||[];
  const card=cur.draft.offered.find(id=>!taken.includes(id)&&!owned.includes(id));
  assert(card,'safe offer must allow each player to select sequentially');
  if(owned.length>=3)assert.equal(squadPick(cur,seat,card),null,'replacement is explicit');
  const next=squadPick(cur,seat,card,owned.length>=3?owned[0]:null);
  assert(next,'legal selection');
  cur=next;
  assert.equal(squadHand(cur.draft,seat).length,Math.min(round,3));
  assert.equal(new Set(cur.draft.taken).size,cur.draft.taken.length);
  assert.equal(cur.draft.taken.length,cur.draft.turn);
 }
 assert.equal(JSON.stringify(state),before,'reducer does not mutate previous Firebase snapshot');
 assert.equal(cur.phase,'round_end');
 assert.equal(cur.draft.complete,true);
 game={...cur,phase:'playing',round:round+1,draft:squadNextRound(cur.draft)};
 for(const seat of seats)assert.equal(squadHand(game.draft,seat).length,Math.min(round,3));
}
game.phase='match_end';game.scores.blue=3;
assert.equal(squadBegin(game,'12345'),null);
const occupied={blue1:['empty_sprint','moving_reload','last_shell'],blue2:['hit_stride','finisher','followthrough'],
 red1:['opening_guard','clutch_armor','last_shell'],red2:['moving_reload','finisher','empty_sprint']};
for(let round=5;round<12;round++){
 const order=squadOrder(round%2?'blue':'red',round-1),offer=squadOffer(occupied,'45678',round,order);
 assert(offer.length>=6&&offer.length<=9,'late-hand may expand offers safely across all nine cards');
 assert.equal(new Set(offer).size,offer.length);
 function walk(i,taken){
  if(i===4)return;
  const seat=order[i],options=offer.filter(id=>!taken.includes(id)&&!occupied[seat].includes(id));
  assert(options.length>0,'no early sequence may starve late picker');
  for(const id of options)walk(i+1,[...taken,id]);
 }
 walk(0,[]);
}
const draft=squadNewMatch();
draft.owned.blue1=['finisher','followthrough','hit_stride'];
draft.owned.red1=['opening_guard','clutch_armor'];
const g={draft,seats:Object.fromEntries(seats.map(s=>[s,{id:s+'_id'}])),
 hp:{blue1_id:100,red1_id:70},stats:{red1_id:{char:'sniper'}}};
const attack={owner:'blue1_id',victim:'red1_id',amount:10,kind:'normal'};
const first=squadDamage(g,attack,7000);
assert.equal(first.amount,3,'opening guard 7 damage mitigation');
assert.equal(g.draft.strideUntil.blue1,8800,'hit stride activation');
const low=squadDamage({...g,hp:{...g.hp,red1_id:22}},attack,8000);
assert.equal(low.amount,16,'finisher and followthrough cap at 7, 8% armor');
const recoilDraft=squadNewMatch();
recoilDraft.owned.blue1=['recoil_shot'];
const recoilGame={draft:recoilDraft,
 seats:Object.fromEntries(seats.map(s=>[s,{id:s+'_id'}])),
 stats:{red1_id:{char:'gunner'}},hp:{red1_id:100}};
const normal=squadDamage(recoilGame,{owner:'blue1_id',victim:'red1_id',amount:10,kind:'normal'},9000);
assert.equal(normal.amount,11,'recoil grants 10% damage in host-authoritative squad hit reducer');
const ult=squadDamage(recoilGame,{owner:'blue1_id',victim:'red1_id',amount:10,kind:'effect'},9050);
assert.equal(ult.amount,10,'recoil does not buff ultimate or gadget');
assert(html.includes("motion(g,a.owner,{...delta,a:a.angle})"),'recoil motion belongs to authoritative host');
assert(html.includes("s.draftRecoilUntil=t+1200"),'one movement per volley under 1.2 second cooldown');
assert(html.includes("normalAttack:true"),'ordinary Bomber bombs distinguish from ultimate bomb fan');
assert(src.includes("id:'delayed_blast'"),'delayed blast available to squad after host-side implementation');
assert(html.includes("squadBlastAuthorize(draft,seat,actionId,t)"),'authoritative hit invokes shared blast gate');
const blast=squadNewMatch();blast.owned.blue1=['delayed_blast'];
assert.equal(squadBlastAuthorize(blast,'blue1','fire100',1000),true,'first normal volley triggers blast');
assert.equal(squadBlastAuthorize(blast,'blue1','fire100',1001),false,'five pellets of same volley do not duplicate');
assert.equal(squadBlastAuthorize(blast,'blue1','fire101',1500),false,'three-second cooldown enforced');
assert.equal(squadBlastAuthorize(blast,'blue1','fire102',4000),true,'next volley after cooldown triggers');
assert.equal(squadBlastAuthorize(blast,'blue2','fire103',4000),false,'unowned card cannot be used');
assert.equal(squadBlastAuthorize(blast,'missing','fire104',4000),false,'invalid seat cannot trigger');
for(let i=0;i<110;i++)squadBlastAuthorize(blast,'blue1','fireLong'+i,7500+3100*i);
assert(Object.keys(blast.blastUsed).length<=80,'used volley IDs must not grow unbounded');
const cleared=squadNextRound(blast);
assert.equal(Object.keys(cleared.blastUsed).length,0,'round reset clears dedupe');
assert.equal(Object.keys(cleared.blastCooldown).length,0,'round reset clears cooldown');
assert(html.includes("until:t+700,damage:10,radius:55"),'blast delay/radius/damage numbers');
assert(html.includes("hit(key+':'+victim,u.owner,victim,u.damage,{kind:'effect'})"),
 'secondary blast is effect damage and must NOT trigger another delayed explosion');
assert(src.includes("id:'split_round'")&&src.includes("id:'ricochet'"),'2v2 split and ricochet implemented');
assert(html.includes("kind:u.normalAttack===true?'normal':'effect'"),'ULT does not receive recoil damage bonus');
// Execute exact online-host split step in a pure VM: one central shot -> two 60%-damage children.
const advStart=html.indexOf('  function draftAdvance(b,dt,g,targetHit,now){');
const advEnd=html.indexOf('  function initialize(matchId,seats,mode,startAt){',advStart);
assert(advStart>0&&advEnd>advStart,'exact host split physics must be embedded');
const advance=vm.runInNewContext(
 'const W=1000,H=600,tankDamage=()=>10,wall=()=>false;'+
 'const BrawlProjectileV1={damage:b=>b.damage,advance:()=>true};'+
 html.slice(advStart,advEnd)+'\n draftAdvance',
 {},{timeout:1000});
const splitGame={projectiles:{}},original={id:'volley:2',fireId:'volley',x:120,y:300,vx:600,vy:0,
 dist:0,range:240,radius:6,damage:10,char:'gunner',splitCenter:true,blastEligible:true};
assert.equal(advance(original,.25,splitGame,()=>false,1000),false,'center bullet replaced at halfway');
const kids=Object.values(splitGame.projectiles);
assert.equal(kids.length,2,'only two daughter projectiles');
assert.deepEqual(kids.map(b=>b.damageScale),[.6,.6],'60% scale per child at final hit distance');
assert(kids.every(b=>b.char==='gunner'&&b.damage===10),'split children retain original weapon damage rules');
assert(html.includes('damage:BALANCE.bomberDamage*(half?.5:1)'),'Bomber mini-blasts must each do half damage');
assert(html.includes('enhanced:!!s.armed&&(!half||i===0)'),'Bomber enhanced DOT may be applied only once');
assert(html.includes('squadBlastAuthorize(draft,seat,actionId,t)'),'delayed blast must preserve one per original action');
// Execute the EXACT host reflection and Bomber geometry, not a duplicated test implementation.
const ricochetStart=html.indexOf('  function draftReflectAxis(px,py,nx,ny,r){');
const ricochetEnd=html.indexOf('  function initialize(matchId,seats,mode,startAt){',ricochetStart);
assert(ricochetStart>0&&ricochetEnd>ricochetStart,'reflector must belong to the host reducer');
const ricochetFunctions=vm.runInNewContext(
 "const W=1000,H=600;"+
 "const wall=(x,y,r=0)=>x+r>150&&x-r<190&&y+r>80&&y-r<160;"+
 "const BrawlProjectileV1={advance:()=>true};"+
 html.slice(ricochetStart,ricochetEnd)+"\n({draftAdvance,draftBombBounce})",
 {},{timeout:1000});
const rebound={id:'r:0',fireId:'r',x:105,y:120,vx:120,vy:0,dist:0,
 range:240,radius:4,damage:10,splitCenter:false,ricochetEnabled:true,ricochetUsed:0};
const reboundGame={projectiles:{}};
assert.equal(ricochetFunctions.draftAdvance(rebound,.55,reboundGame,()=>false,500),true);
assert.equal(rebound.ricochetUsed,1,'exactly one wall reflection');
assert.equal(rebound.vx,-120,'horizontal wall reverses horizontal velocity');
assert.equal(rebound.damageScale,.7,'the first ricochet scales damage to 70%');
assert.equal(reboundGame.draftCardStats.ricochets,1,'host counts confirmed reflections');
rebound.x=145;rebound.y=120;rebound.vx=120; // approaching same wall again
assert.equal(ricochetFunctions.draftAdvance(rebound,.1,reboundGame,()=>false,600),false,
 'a second terrain strike must absorb the bullet, not bounce again');
assert.equal(reboundGame.draftCardStats.ricochets,1,'second collision does not increment bounces');
const corner={id:'corner',x:125,y:55,vx:120,vy:120,dist:0,range:240,radius:3,
 ricochetEnabled:true,ricochetUsed:0,splitCenter:false};
const cornerGame={projectiles:{}};
assert.equal(ricochetFunctions.draftAdvance(corner,.4,cornerGame,()=>false,700),false,
 'diagonal corner collision is absorbed instead of choosing a fake normal');
assert.equal(corner.ricochetUsed,0,'ambiguous corners cannot bounce or pass walls');
const splitWithBounce={id:'split:0',fireId:'original-fire',x:105,y:120,
 vx:120,vy:0,dist:0,range:140,radius:4,damage:10,
 splitCenter:true,ricochetEnabled:true,ricochetUsed:0};
const combine={projectiles:{}};
assert.equal(ricochetFunctions.draftAdvance(splitWithBounce,.8,combine,()=>false,800),false);
const bouncedKids=Object.values(combine.projectiles);
assert.equal(bouncedKids.length,2,'one center shot creates two daughters, even after bounce');
assert(bouncedKids.every(k=>k.ricochetUsed===1&&k.fireId==='original-fire'),
 'children inherit the bounce budget and the original shot ID');
assert(bouncedKids.every(k=>Math.abs(k.damageScale-.42)<1e-10),
 'split after bounce multiplies .7 ricochet by .6 split damage');
const bombRebound=ricochetFunctions.draftBombBounce({x:100,y:120},{x:220,y:120});
assert.equal(bombRebound.bounced,true,'Bomber throw reflects when terrain is encountered');
assert(bombRebound.x<150,'reflected Bomber bomb cannot land through the wall');
const bombCorner=ricochetFunctions.draftBombBounce({x:100,y:30},{x:200,y:130});
assert(bombCorner.blocked===true,'Bomber corner collision terminates safely');
assert(html.includes('damage:BALANCE.bomberDamage*(half?.5:1)*(trajectory.bounced?.7:1)'),
 'normal Bomber shot takes exactly one 70% bounce multiplier');
assert(html.includes("ricochetEnabled:(s.draftCards||[]).includes('ricochet')"),
 'only card owners may bounce normal bullets');
assert(html.includes("if(!b.splitCenter&&!b.ricochetEnabled)"),
 'non-card projectiles stay on original verified physics');

const singleVolley=squadNewMatch();
singleVolley.owned.blue1=['followthrough'];
const sameG={draft:singleVolley,seats:Object.fromEntries(seats.map(s=>[s,{id:s+'_id'}])),
 stats:{red1_id:{char:'tank'}},hp:{red1_id:160}};
const f1=squadDamage(sameG,{owner:'blue1_id',victim:'red1_id',amount:10,
 kind:'normal',fireId:'volley-X'},8100);
const f2=squadDamage(sameG,{owner:'blue1_id',victim:'red1_id',amount:10,
 kind:'normal',fireId:'volley-X'},8200);
const f3=squadDamage(sameG,{owner:'blue1_id',victim:'red1_id',amount:10,
 kind:'normal',fireId:'volley-Y'},8300);
assert.equal(f1.amount,10);
assert.equal(f2.amount,10,'a second split child cannot trigger followthrough from the same original shot');
assert.equal(f3.amount,13,'a separate new shot can trigger followthrough');
assert.equal(squadMoveFactor(draft,'blue1',0,7500),1.07);
assert.equal(squadReloadFactor({owned:{blue1:['last_shell','moving_reload']}},'blue1',0,1500,600),1.20);
assert.equal(squadReloadFactor({owned:{blue1:['moving_reload']}},'blue1',1,900,600),1);
assert(html.includes("const ROOT='roomsDraft2v2',PROTOCOL=13012"),'isolated four-person Firebase protocol');
assert(html.includes("db.useEmulator('127.0.0.1',9000)"));
assert(!html.includes("db.ref('rooms2v2/"),'normal online rooms are not used');
assert(!fs.existsSync(path.join(root,'sites/BRAWL_DRAFT_2vs2.html')),'cannot publish before approval');
console.log('PASS squad draft: four-seat winner/loser snake, deterministic anti-starvation offers, 4-round picks, 3-card replacement, duel cards, isolated emulator');
