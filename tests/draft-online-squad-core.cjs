// Squad Tactical Draft: static and deterministic transaction contracts, no cloud.
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const root=path.resolve(__dirname,'..'),src=fs.readFileSync(path.join(root,'draft/squad-online-prototype.inc.js'),'utf8');
const html=fs.readFileSync(path.join(root,'online/draft-squad-online-lab.html'),'utf8');
assert(html.includes(src),'Standalone squad HTML inlines pure draft reducer verbatim');
for(const [i,m] of [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].entries())
 if(m[1].trim())new vm.Script(m[1],{filename:'draft-squad-lab#'+i});
const names=['squadNewMatch','squadHand','squadOrder','squadOffer','squadBegin','squadPick','squadNextRound','squadDamage','squadMoveFactor','squadReloadFactor','squadBlastAuthorize','squadGad2Equipped'];
const api=vm.runInNewContext(src+'\n({'+names.join(',')+'})',{},{timeout:2000});
const {squadNewMatch,squadHand,squadOrder,squadOffer,squadBegin,squadPick,squadNextRound,squadDamage,squadMoveFactor,squadReloadFactor,squadBlastAuthorize,squadGad2Equipped}=api;
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
 'const W=1000,H=600,tankDamage=()=>10,wall=()=>false,draftSolid=(g,x,y,r)=>wall(x,y,r);'+
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
const ricochetStart=html.indexOf('  function draftReflectAxis(px,py,nx,ny,r,g){');
const ricochetEnd=html.indexOf('  function initialize(matchId,seats,mode,startAt){',ricochetStart);
assert(ricochetStart>0&&ricochetEnd>ricochetStart,'reflector must belong to the host reducer');
const ricochetFunctions=vm.runInNewContext(
 "const W=1000,H=600;"+
 "const wall=(x,y,r=0)=>x+r>150&&x-r<190&&y+r>80&&y-r<160;"+
 "const draftSolid=(g,x,y,r)=>wall(x,y,r);const BrawlProjectileV1={advance:()=>true};"+
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

// Test the actual host rectangle placement / expiring wall collision helpers.
const placementBegin=html.indexOf('  const boxTouch=(x,y,r,w)=>');
const placementEnd=html.indexOf('  const bounded=o=>',placementBegin);
assert(placementBegin>0&&placementEnd>placementBegin,'host wall helpers extracted');
const realWallGeometry=html.slice(placementBegin,placementEnd);
const makeWallFixture=(physical=[])=>vm.runInNewContext(
 "const W=1000,H=600,R=18,BALANCE={areaRadius:118};"+
 "const walls="+JSON.stringify(physical)+";"+
 "const seatKeys=['blue1','blue2','red1','red2'];"+
 "const point=(g,id,input)=>input[id];"+
 realWallGeometry+"\n ({draftSolid,draftWallBoxes,draftWallPlacement})",
 {},{timeout:1000});
const wallsVM=makeWallFixture();
const positions={a:{x:200,y:300},b:{x:750,y:300},c:{x:850,y:500},d:{x:850,y:100}};
const wallMatch={mode:'ko',clock:{t:100},seats:{blue1:{id:'a'},blue2:{id:'b'},
 red1:{id:'c'},red2:{id:'d'}},hp:{a:160,b:100,c:100,d:100},gad2Walls:{}};
const rect=wallsVM.draftWallPlacement(wallMatch,'a',positions.a,0,positions,100);
assert(rect&&rect.w===42&&rect.h===112&&rect.x===274&&rect.y===244,
 'portable wall appears 95 units ahead, size exactly 42x112');
wallMatch.gad2Walls.blue1={kind:'portable_wall',start:100,until:4100,...rect};
assert(wallsVM.draftSolid(wallMatch,290,300,6,200),'active wall blocks projectiles');
assert(wallsVM.draftSolid(wallMatch,290,300,18,200),'active wall blocks players');
assert(!wallsVM.draftSolid(wallMatch,290,300,6,4100),'wall stops blocking at 4s expiry');
assert.equal(wallsVM.draftWallPlacement(wallMatch,'a',positions.a,0,positions,200),null,
 'cannot overlap any still-active portable wall');
const ownerInside={...positions,a:{x:295,y:300}};
assert.equal(wallsVM.draftWallPlacement({...wallMatch,gad2Walls:{}},'a',{x:200,y:300},0,ownerInside,100),null,
 'reject wall that would trap any live teammate or enemy');
const physical=makeWallFixture([{x:275,y:240,w:42,h:115}]);
assert.equal(physical.draftWallPlacement({...wallMatch,gad2Walls:{}},'a',positions.a,0,positions,100),null,
 'cannot overlap permanent KO terrain');
assert.equal(wallsVM.draftWallPlacement({...wallMatch,gad2Walls:{}},'a',{x:40,y:300},Math.PI,positions,100),null,
 'reject out-of-bounds deployment');
assert(src.includes("id:'portable_wall'")&&
 src.includes("'warp_beacon','portable_wall'"),'wall must be offered only when host supports it');
assert(html.includes("g.gad2Walls[seat]={kind:'portable_wall'")&&
 html.includes("g.draft.gadget2ReadyAt[seat]=t+12000")&&
 html.includes("until:t+4000"),'host owns one wall and its 4s/12s timers');
assert(html.includes("wallHit:(x,y,r)=>draftSolid(g,x,y,r)"),
 'straight bullets collide with temporary walls');
assert(html.includes("if(draftSolid(g,nx,ny,b.radius))"),
 'split and ricochet bullets collide with temporary walls');
assert(html.includes("function touchingWall(x,y){return [...WALLS,...draftVisibleWalls()]"),
 'Safari player collision uses the same host-authored wall set');
assert(html.includes("if(!draftSolid(g,px,py,R+3))")===false,
 'warp safety uses dynamic wall rejection rather than accepting an occupied endpoint');
assert(html.includes("Object.keys(g.gad2Walls||{}).length"),
 'quiet host tick must not defer temporary wall expiry');

// Actual host hologram movement and sight geometry: no duplicate simulation.
const holoStart=html.indexOf('  function draftHoloRayClear(g,a,b){');
const holoEnd=html.indexOf('  function initialize(matchId,seats,mode,startAt){',holoStart);
assert(holoStart>0&&holoEnd>holoStart,'hologram helpers must live inside host engine');
const holoFns=vm.runInNewContext(
 "const R=18,W=1000,H=600,seatKeys=['blue1','red1'];"+
 "const team=k=>k.startsWith('blue')?'blue':'red';"+
 "const seatOf=(g,id)=>seatKeys.find(k=>g.seats[k]?.id===id);"+
 "const draftSolid=(g,x,y,r)=>x+r>450&&x-r<490&&y+r>80&&y-r<220;"+
 "const move=(p,dx,dy,g)=>{let x=p.x,y=p.y;"+
 "for(let i=0;i<24;i++){const nx=x+dx/24,ny=y+dy/24;"+
 "if(!draftSolid(g,nx,y,R))x=nx;if(!draftSolid(g,x,ny,R))y=ny;}"+
 "return {...p,x,y}};"+
 html.slice(holoStart,holoEnd)+"\n({draftHoloAdvance,draftHoloRayClear})",
 {},{timeout:1000});
const holoGame={hp:{blue:160,red:100},
 seats:{blue1:{id:'blue'},red1:{id:'red'}}};
const holo={kind:'hologram',id:'h',owner:'blue',team:'blue',char:'tank',
 x:300,y:150,a:0,strafe:1,swapAt:1450,fireAt:800,shotCount:0};
const holoTarget={red:{x:700,y:150}};
const oldHolo={...holo};
const ai=holoFns.draftHoloAdvance(holoGame,holo,holoTarget,.1,1000);
assert(ai&&ai.enemy===holoTarget.red,'hologram targets an actual enemy seat');
assert(Math.hypot(holo.x-oldHolo.x,holo.y-oldHolo.y)<=9.701&&
 Math.hypot(holo.x-oldHolo.x,holo.y-oldHolo.y)>0,
 'hologram autonomously moves within 97 world units/s');
assert(Math.abs(holo.a)<.01,'hologram aims at opponent rather than facing a static angle');
assert.equal(holoFns.draftHoloRayClear(holoGame,{x:300,y:150},{x:700,y:150}),false,
 'hologram cannot fire blank shots through solid walls');
assert.equal(holoFns.draftHoloRayClear(holoGame,{x:300,y:270},{x:700,y:270}),true,
 'hologram may fake-shoot only along a clear lane');
assert(src.includes("id:'hologram'")&&
 src.includes("'portable_wall','hologram'"),'fifth GAD2 offered after implementation');
assert(html.includes("g.gad2Holograms[seat]={kind:'hologram'"),'single host decoy per seat');
assert(html.includes("start:t,until:t+7000")&&html.includes("g.draft.gadget2ReadyAt[seat]=t+14000"),
 'seven-second decoy and fourteen-second cooldown');
assert(html.includes("g.gad2FakeShots[k]={kind:'hologramFakeShot'")&&
 html.includes("until:t+380,damage:0"),'blank bullets have exactly zero damage');
assert(html.includes("for(const fake of Object.values(game?.gad2FakeShots||{}))"),
 'client renders fake bullets separately');
assert(!html.includes("g.projectiles[k]={kind:'hologramFakeShot'"),
 'fake shots cannot enter real normal projectiles');
assert(html.includes("g.draftCardStats.gad2HologramsDissolved")&&
 html.includes("emit('hologramDissolve'"),
 'host marks one-action destruction with readable visual dissolve');
assert(html.includes("label:ally?'分身':'ENEMY'"),
 'allies must see a decoy marker and enemies no giveaway');
assert(html.includes("if(h.team===bullet.team||h.until<=t"),
 'friendly shots cannot destroy allied holograms');
assert(html.includes("Object.keys(g.gad2Holograms||{}).length"),
 'host combat clock cannot defer a living decoy');

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
// Separate GAD2 slot: the most recently acquired supported ability is equipped.
const mineDraft=squadNewMatch();
assert.equal(squadGad2Equipped(mineDraft,'blue1'),null);
mineDraft.owned.blue1=['trap_mine','recoil_shot'];
assert.equal(squadGad2Equipped(mineDraft,'blue1'),'trap_mine');
mineDraft.gadget2ReadyAt={blue1:12345};
const mineNext=squadNextRound(mineDraft);
assert.equal(squadGad2Equipped(mineNext,'blue1'),'trap_mine');
assert.equal(Object.keys(mineNext.gadget2ReadyAt).length,0,'new round resets cooldown');
assert(src.includes("id:'trap_mine'")&&src.includes("id:'smoke'"),'two implemented 2vs2 GAD2 effects offered');
assert(html.includes("a.type==='gadget2'"),'host authority handles the distinct action');
assert(html.includes("g.draft.gadget2ReadyAt[seat]=t+12000"),'12 second host cooldown');
assert(html.includes("until:t+9000"),'9 second lifetime');
assert(html.includes("hit('gad2mine:'+mine.id+':'+victim,mine.owner,victim,8"),
 'exact host 8 damage, not a client effect');
assert(html.includes("slowUntil:Math.max(previous.slowUntil||0,t+1400)"),
 '1400ms slow cannot overwrite a longer slow');
assert(html.includes("g.gad2Mines[seat]={kind:'trap_mine'"),'one active mine per seat');
assert(html.includes("delete g.gad2Mines[seat]"),'mine consumed or expired');
assert(html.includes("if(team(k)===mine.team)continue"),'no friendly fire');
assert(html.includes("if(!canHit(victim)||"),'no hit on invulnerable or dead targets');
assert(html.includes("break; // One enemy activation"),'one trigger only');
assert(html.includes("if(draftSolid(g,x,y,12))return reject('gadget2_wall')"),'no placement inside walls');
assert(html.includes("['shot','gadget','gadget2','ultimate']"),'protocol whitelists GAD2');
assert(html.includes("b.id='squadGad2Action'"),'separate mobile button exists');
assert(html.includes("window.__brawlDraftGad2FireQA"),'live E2E uses normal action dispatch');

// Combo drafting: among multiple owned GAD2 cards, the most recently picked
// supported card stays equipped, including after 3-card replacement/round reset.
const combo=squadNewMatch();
combo.owned.blue1=['smoke','portable_wall','hologram'];
assert.equal(squadGad2Equipped(combo,'blue1'),'hologram');
combo.owned.blue1=['smoke','portable_wall','warp_beacon'];
assert.equal(squadGad2Equipped(combo,'blue1'),'warp_beacon');
combo.owned.blue1=['hologram','trap_mine','portable_wall'];
assert.equal(squadGad2Equipped(combo,'blue1'),'portable_wall');
const comboNewRound=squadNextRound(combo);
assert.equal(squadGad2Equipped(comboNewRound,'blue1'),'portable_wall',
 'three-card loadout and GAD2 equip survive round transition');
assert.equal(Object.keys(comboNewRound.gadget2ReadyAt||{}).length,0,
 'cooldowns never leak into the next round');

// The UI uses the actual server reason, not local guesses; do not silently
// drop a rejected card placement or pretend the cooldown was spent.
const receiptStart=html.indexOf('function squadGad2ReceiptMessage(receipt,card,beaconActive){');
const receiptEnd=html.indexOf('function squadGad2Receipts(){',receiptStart);
assert(receiptStart>0&&receiptEnd>receiptStart,'GAD2 feedback must be wired to host receipts');
const receiptMessage=vm.runInNewContext(html.slice(receiptStart,receiptEnd)+
 '\nsquadGad2ReceiptMessage',{}, {timeout:1000});
const accepted=card=>({status:'accepted'});
const rejected=reason=>({status:'rejected',reason});
assert.equal(receiptMessage(accepted('portable_wall'),'portable_wall',false),'壁を設置！');
assert.equal(receiptMessage(accepted('hologram'),'hologram',false),'分身を召喚！');
assert.equal(receiptMessage(accepted('warp_beacon'),'warp_beacon',true),'ビーコンを設置！');
assert.equal(receiptMessage(accepted('warp_beacon'),'warp_beacon',false),'ビーコンに帰還！');
for(const reason of ['gadget2_wall_placement','gadget2_wall','gadget2_occupied',
 'gadget2_warp_blocked','gadget2_beacon_wall','gadget2_cooldown']){
 const message=receiptMessage(rejected(reason),'portable_wall',false);
 assert(message.length>5&&!message.includes('GAD2を使用できませんでした'),
   'host reason '+reason+' must produce specific Japanese feedback');
}
assert(html.includes('squadRender();gadgetReceipts();squadGad2Receipts();'),
 'online snapshot updates must display host-confirmed GAD2 receipts');
assert(html.includes("Math.abs(serverNow()-r.acceptedAt)>5000"),
 'reconnect must not replay ancient GAD2 confirmations as new actions');

mineDraft.owned.blue2=['smoke'];
assert.equal(squadGad2Equipped(mineDraft,'blue2'),'smoke','GAD2 chooses the new smoke card');
mineDraft.owned.blue2=['smoke','trap_mine'];
assert.equal(squadGad2Equipped(mineDraft,'blue2'),'trap_mine','last acquired GAD2 equips');
assert(html.includes("g.gad2Smokes[seat]={kind:'smoke'"),'smoke exists only in host-authored state');
assert(html.includes("x,y,radius:100,start:t,until:t+4000"),'exact smoke lifespan/radius');
assert(html.includes("g.draftCardStats.gad2SmokesPlaced"),'host commits smoke usage audit');
assert(html.includes("g.draft.gadget2ReadyAt[seat]=t+12000"),'independent cooldown also applies to smoke');
assert(html.includes("draftConcealed(p),revealedUntil:game?.reveals?.[id]"),
 'enemy visibility reuses bush stealth, no new custom fog implementation');
assert(html.includes("if(!draftConcealed(local))return 'visible'"),
 'owner UI respects smoke concealment');
assert(html.includes("stealth==='hidden'?'煙幕：潜伏中':'煙幕：発見中'"),
 'owner clearly knows when smoke stealth is active or detected');
assert(html.includes("a.type==='shot'&&Object.values(g.gad2Smokes||{}).some("),
 'host firing from smoke sets attack reveal clock');
assert(html.includes(")?700:1500"),'attack in smoke reveals for exactly 700ms');
assert(html.includes("window.__brawlDraftStealthQA"),'WebKit smoke visibility uses actual game function');
assert(!html.includes("db.ref('rooms2v2/"),'normal online rooms remain isolated');

// Run the EXACT host warp landing code in VM, not a duplicate test algorithm.
const warpStart=html.indexOf('  function draftWarpLanding(g,owner,x,y,input){');
const warpEnd=html.indexOf('  function initialize(matchId,seats,mode,startAt){',warpStart);
assert(warpStart>0&&warpEnd>warpStart,'warp landing helper must be host scoped');
const warpSource=html.slice(warpStart,warpEnd);
const warpEvaluate=(obstacles,positions)=>{
 const mocked="const W=1000,H=600,R=18,seatKeys=['blue1','red1'];"+
   "const point=(g,id,input)=>input[id];"+
   "const wall=(x,y,r)=>["+JSON.stringify(obstacles)+"][0].some(w=>"+
   "x+r>w.x&&x-r<w.x+w.w&&y+r>w.y&&y-r<w.y+w.h);"+
   "const draftSolid=(g,x,y,r)=>wall(x,y,r);";
 return vm.runInNewContext(mocked+warpSource+"\n draftWarpLanding",
   {},{timeout:1000})(
   {seats:{blue1:{id:'blueId'},red1:{id:'redId'}},hp:{blueId:160,redId:100}},
   'blueId',positions.x,positions.y,{redId:{x:positions.enemyX||850,y:positions.enemyY||450}});
};
const unobstructed=warpEvaluate([],{x:560,y:300});
assert.equal(unobstructed.x,560);
assert.equal(unobstructed.y,300,'exact beacon point when safe');
const blockedByWall=warpEvaluate([{x:520,y:265,w:70,h:70}],{x:560,y:300});
assert(blockedByWall&&Math.hypot(blockedByWall.x-560,blockedByWall.y-300)<=76.01,
 'blocked beacon finds first safe landing within 76 units');
assert(!((blockedByWall.x+21>520&&blockedByWall.x-21<590)&&
 (blockedByWall.y+21>265&&blockedByWall.y-21<335)),
 'wall landing stays outside expanded wall box');
const occupiedByEnemy=warpEvaluate([],{x:560,y:300,enemyX:560,enemyY:300});
assert(occupiedByEnemy&&Math.hypot(occupiedByEnemy.x-560,occupiedByEnemy.y-300)>38,
 'cannot warp on top of a live opponent');
assert.equal(warpEvaluate([{x:0,y:0,w:1000,h:600}],{x:560,y:300}),null,
 'fully blocked destination cancels warp rather than wall clipping');
assert(src.includes("id:'warp_beacon'")&&src.includes("'trap_mine','smoke','warp_beacon'"),
 'Warp offered and equipped with hologram still gated');
assert(html.includes("g.gad2Beacons[seat]={kind:'warp_beacon'"),'canonical one beacon per seat');
assert(html.includes("ownerLife:s.life,team:team(seat),x:pos.x,y:pos.y,start:t,until:t+7000"),
 'beacon saves exact live owner position, life, and 7-second expiry');
assert(html.includes("const dst=draftWarpLanding(g,a.owner,live.x,live.y,input)"),
 'return position is host validated');
assert(html.includes("if(!dst)return reject('gadget2_warp_blocked')"),
 'no safe landing preserves the beacon, rejects warp and does not consume cooldown');
assert(html.includes("motion(g,a.owner,{...dst,a:a.angle})"),
 'warp uses persisted authoritative motion revision, not client-only prediction');
assert(html.includes("g.draft.gadget2ReadyAt[seat]=t+15000"),
 '15-second cooldown begins on successful return');
assert(html.includes("old.until+15000"),
 '15-second cooldown begins after expired beacon before another host tick');
assert(html.includes("g.draftCardStats.gad2WarpReturns"),'host writes return audit');
assert(html.includes("g.draftCardStats.gad2BeaconsBroken"),
 'enemy damage can destroy one-hit beacon');
assert(html.includes("if(beacon.team===bullet.team||beacon.until<=t)continue"),
 'friendly shots may not destroy allied beacon');
assert(html.includes("g.gad2Beacons ||= {}"),
 'RTDB transaction owns the beacon state without external mutation');
assert(html.includes("beacons:structuredClone(game?.gad2Beacons||{})"),
 'actual WebKit can read replicated beacon state');

assert.equal(squadMoveFactor(draft,'blue1',0,7500),1.07);
assert.equal(squadReloadFactor({owned:{blue1:['last_shell','moving_reload']}},'blue1',0,1500,600),1.20);
assert.equal(squadReloadFactor({owned:{blue1:['moving_reload']}},'blue1',1,900,600),1);
assert(html.includes("const ROOT='roomsDraft2v2',PROTOCOL=13012"),'isolated four-person Firebase protocol');
assert(html.includes("db.useEmulator('127.0.0.1',9000)"));
assert(!html.includes("db.ref('rooms2v2/"),'normal online rooms are not used');
assert(!fs.existsSync(path.join(root,'sites/BRAWL_DRAFT_2vs2.html')),'cannot publish before approval');
console.log('PASS squad draft: four-seat winner/loser snake, deterministic anti-starvation offers, 4-round picks, 3-card replacement, duel cards, isolated emulator');
