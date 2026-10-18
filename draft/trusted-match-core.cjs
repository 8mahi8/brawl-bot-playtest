// BRAWL Draft Wave 4E: pure trusted-match core (prototype, NOT live game physics).
// Call ONLY from a trusted backend, never include this in browser client HTML.
// Input must come from an authenticated per-UID RTDB intent path. Coordinates
// and clock supplied by the browser are never used for hit or movement authority.
'use strict';
const assert=require('node:assert/strict');
const WORLD={width:1920,height:1060,radius:18,shotRange:300,hitRadius:19,
 shotDamage:10,shotCooldownMs:450,walkPxPerMs:0.25,maxStepMs:120};
const SPAWNS={blue1:{x:500,y:420},blue2:{x:500,y:700},
 red1:{x:640,y:420},red2:{x:640,y:700}};
const SEATS=['blue1','blue2','red1','red2'];
const goodId=s=>typeof s==='string'&&/^[a-zA-Z0-9_-]{8,80}$/.test(s);
const valid=s=>Number.isFinite(s);
function makeMatch(players,matchId='match-000001',now=100000){
 assert(goodId(matchId));
 assert(players&&Object.keys(players).length===4,'trusted coordinator demo expects four seats');
 assert.deepEqual(Object.keys(players).sort(),SEATS.slice().sort());
 assert.equal(new Set(Object.values(players)).size,4,'UIDs must be unique');
 const state={phase:'playing',matchId,round:1,score:{blue:0,red:0},
   winner:'none',revision:0,lives:{},hp:{},lastSeq:{},players:{},walls:[]};
 for(const seat of SEATS){
  const uid=players[seat];assert(goodId(uid),'invalid UID: '+seat);
  const spawn=SPAWNS[seat];
  state.players[uid]={seat,team:seat.slice(0,seat.length-1),x:spawn.x,y:spawn.y,
   ammo:3,lastMoveAt:now,lastShotAt:0,lastSeq:0,life:0};
  state.hp[uid]=160;state.lives[uid]=0;state.lastSeq[uid]=0;
 }
 return state;
}
const boxHas=(x,y,b,pad=0)=>x>=b.x-pad&&x<=b.x+b.w+pad&&y>=b.y-pad&&y<=b.y+b.h+pad;
function segmentBox(ax,ay,bx,by,b,pad=0){
 // Liang-Barsky interval clipping; conservatively blocks a ray at wall edges.
 const rect={x:b.x-pad,y:b.y-pad,w:b.w+pad*2,h:b.h+pad*2};
 const dx=bx-ax,dy=by-ay;let lo=0,hi=1;
 for(const [p,q] of [[-dx,ax-rect.x],[dx,rect.x+rect.w-ax],
   [-dy,ay-rect.y],[dy,rect.y+rect.h-ay]]){
  if(Math.abs(p)<1e-9){if(q<0)return false;continue;}
  const t=q/p;if(p<0)lo=Math.max(lo,t);else hi=Math.min(hi,t);
  if(lo>hi)return false;
 }
 return lo<=hi;
}
function lineTarget(state,attacker,angle){
 const ux=Math.cos(angle),uy=Math.sin(angle);
 const candidates=[];
 for(const [id,v] of Object.entries(state.players)){
  if(v.team===attacker.team||(state.hp[id]||0)<=0)continue;
  const dx=v.x-attacker.x,dy=v.y-attacker.y,along=dx*ux+dy*uy;
  if(along<0||along>WORLD.shotRange)continue;
  const off=Math.abs(dx*uy-dy*ux);
  if(off>WORLD.hitRadius)continue;
  if((state.walls||[]).some(b=>segmentBox(attacker.x,attacker.y,v.x,v.y,b,5)))continue;
  candidates.push({id,along});
 }
 candidates.sort((a,b)=>a.along-b.along);
 return candidates[0]?.id||null;
}
function applyIntent(input){
 const {state,uid,actionId,intent,connectionId,now}=input||{};
 if(!state||!intent||typeof uid!=='string'||!valid(now)||!goodId(actionId))
   return {accepted:false,reason:'malformed',state};
 const p=state.players?.[uid];
 if(!p||state.phase!=='playing')return {accepted:false,reason:'not_playing',state};
 if(!goodId(connectionId)||intent.connectionId!==connectionId)
   return {accepted:false,reason:'connection',state};
 if(intent.matchId!==state.matchId||intent.round!==state.round||intent.life!==p.life)
   return {accepted:false,reason:'round_or_life',state};
 if(!Number.isSafeInteger(intent.seq)||intent.seq<=p.lastSeq||intent.seq>p.lastSeq+32)
   return {accepted:false,reason:'sequence',state};
 if(!valid(intent.at)||intent.at<now-5000||intent.at>now+1000)
   return {accepted:false,reason:'time',state};
 if((state.hp[uid]||0)<=0)return {accepted:false,reason:'dead',state};
 if(!['move','shot'].includes(intent.type))
   return {accepted:false,reason:'unsupported',state};
 const next=structuredClone(state),actor=next.players[uid],events=[];
 if(intent.type==='move'){
  const dx=intent.dx,dy=intent.dy,mag=Math.hypot(dx,dy);
  if(!valid(dx)||!valid(dy)||Math.abs(dx)>1||Math.abs(dy)>1||mag>1.00001)
   return {accepted:false,reason:'invalid_movement',state};
  // Server receive time is authority, not supplied x/y, dt, velocity or latency.
  const dt=Math.max(0,Math.min(WORLD.maxStepMs,now-actor.lastMoveAt));
  const x=Math.max(WORLD.radius,Math.min(WORLD.width-WORLD.radius,actor.x+dx*dt*WORLD.walkPxPerMs));
  const y=Math.max(WORLD.radius,Math.min(WORLD.height-WORLD.radius,actor.y+dy*dt*WORLD.walkPxPerMs));
  if(!(next.walls||[]).some(b=>boxHas(x,y,b,WORLD.radius))){actor.x=x;actor.y=y;}
  actor.lastMoveAt=now;
  events.push({type:'move',uid,x:actor.x,y:actor.y});
 }else{
  if(!valid(intent.angle)||Math.abs(intent.angle)>Math.PI*2)
    return {accepted:false,reason:'angle',state};
  if(now-actor.lastShotAt<WORLD.shotCooldownMs||actor.ammo<1)
    return {accepted:false,reason:'cooldown_or_ammo',state};
  actor.ammo--;actor.lastShotAt=now;
  const hit=lineTarget(next,actor,intent.angle);
  if(hit){
   next.hp[hit]=Math.max(0,next.hp[hit]-WORLD.shotDamage);
   events.push({type:'hit',by:uid,victim:hit,damage:WORLD.shotDamage,hp:next.hp[hit]});
   const opposing=actor.team==='blue'?'red':'blue';
   const alive=Object.entries(next.players).some(([id,v])=>v.team===opposing&&next.hp[id]>0);
   if(!alive){
    next.phase='round_end';next.winner=actor.team;next.score[actor.team]++;
    events.push({type:'round_end',winner:actor.team});
   }
  }else events.push({type:'miss',by:uid});
 }
 actor.lastSeq=intent.seq;next.lastSeq[uid]=intent.seq;next.revision++;
 return {accepted:true,reason:'ok',state:next,events};
}
function clientSummary(state){
 return {phase:state.phase,matchId:state.matchId,round:state.round,
  score:{...state.score},winner:state.winner,revision:state.revision};
}
module.exports={WORLD,SPAWNS,SEATS,makeMatch,applyIntent,clientSummary,lineTarget};
