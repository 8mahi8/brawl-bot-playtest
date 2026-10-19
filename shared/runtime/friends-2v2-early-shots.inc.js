// Never feed early remote visuals into host collision, hit preview or RTDB.
// A shot ACTION arrives earlier than the full host game transaction result.
const earlyShots=new Map(),earlyBombSmoothing=new Map();
let earlyShotStats={incoming:0,shown:0,bomber:0,hostHandoffs:0};
function earlyProjectilePoints(a,char,ageMs){
 const spread=char==='tank'?[-.20,-.10,0,.10,.20]:char==='gunner'?[-.075,0,.075]:[0];
 return spread.map((angle,i)=>{
  const wait=char==='gunner'?i*105:0,travel=clamp((ageMs-wait)*.66,0,CHARS[char].range);
  return {id:a.eventId+':'+i,ready:ageMs>=wait,
   x:a.x+Math.cos(a.angle)*28+Math.cos(a.angle+angle)*travel,
   y:a.y+Math.sin(a.angle)*28+Math.sin(a.angle+angle)*travel};
 });
}
function earlyBomberPoint(a,ageMs){
 const origin={x:a.x,y:a.y},dst=engine().landing(origin,a.angle,Math.min(a.reach||BALANCE.bomberRange,BALANCE.bomberRange),game);
 const f=clamp(ageMs/BALANCE.bomberFlightMs,0,1);
 return {x:origin.x+(dst.x-origin.x)*f,y:origin.y+(dst.y-origin.y)*f-Math.sin(f*Math.PI)*80};
}
function observeShotAction(a,localPrediction){
 if(a.type!=='shot'||!connected||paused||!game||game.phase!=='playing'||
    a.matchId!==game.matchId||a.round!==game.round)return;
 const own=a.owner===myId,st=game.stats?.[a.owner],char=st?.char;
 if(!CHARS[char]||(own&&!localPrediction)||(!own&&localPrediction)||own&&char!=='bomber')return;
 if(!own&&(!presence[a.owner]?.[a.connectionId]||a.seq<=(st.lastActionSeq||0)))return;
 const age=serverNow()-a.at;
 if(!Number.isFinite(age)||age>850||age<-250||earlyShots.has(a.eventId))return;
 earlyShots.set(a.eventId,{a,char,created:performance.now(),initial:clamp(age,0,140)});
 if(earlyShots.size>80)earlyShots.delete(earlyShots.keys().next().value);
 earlyShotStats.incoming++;if(char==='bomber')earlyShotStats.bomber++;
}
function renderEarlyShots(now){
 // Bomber visual handoff must not leak state after the host removes an impact.
 for(const key of earlyBombSmoothing.keys())if(!game?.scheduled?.[key])earlyBombSmoothing.delete(key);
 for(const [id,p] of earlyShots){
  const a=p.a,age=p.initial+now-p.created,receipt=game?.usedActions?.[id];
  if(!game||game.phase!=='playing'||paused||!connected||
    a.matchId!==game.matchId||a.round!==game.round||receipt?.status==='rejected'||age>950){
   earlyShots.delete(id);continue;
  }
  // Once host has committed and ticked past the accepted action, an absent
  // projectile/schedule means it already hit a wall, player, or ground.
  // Never keep a client-only ghost projectile alive after that final snapshot.
  if(receipt?.status==='accepted'&&Number.isFinite(receipt.acceptedAt)&&
     (game.clock?.wallAt||0)>=receipt.acceptedAt+80){
   const stillActive=p.char==='bomber'?
    Object.values(game.scheduled||{}).some(u=>u.kind==='bomb'&&
     (u.key===id||u.fireId===id||u.key?.startsWith(id+':'))):
    Object.keys(game.projectiles||{}).some(key=>key.startsWith(id+':'));
   if(!stillActive){earlyShots.delete(id);continue;}
  }
  if(p.char==='bomber'){
   const official=Object.values(game.scheduled||{}).filter(u=>u.kind==='bomb'&&
     (u.key===id||u.fireId===id||u.key?.startsWith(id+':')));
   if(official.length){
    const last=earlyBomberPoint(a,age);
    for(const u of official)if(!earlyBombSmoothing.has(u.key))earlyBombSmoothing.set(u.key,{...last});
    earlyShots.delete(id);earlyShotStats.hostHandoffs++;continue;
   }
   if(age>=BALANCE.bomberFlightMs)continue;
   const pos=earlyBomberPoint(a,age);
   ctx.fillStyle='#ffab65';ctx.beginPath();ctx.arc(pos.x,pos.y,9,0,Math.PI*2);ctx.fill();
   ctx.fillStyle='#fff1ba';ctx.fillRect(pos.x+4,pos.y-13,3,6);
   earlyShotStats.shown++;continue;
  }
  const projectiles=game.projectiles||{},points=earlyProjectilePoints(a,p.char,age);
  for(const pt of points){
   if(projectiles[pt.id]){
    if(!bulletVisuals.has(pt.id))bulletVisuals.set(pt.id,{x:pt.x,y:pt.y});
    continue;
   }
   if(!pt.ready||age>Math.min(790,CHARS[p.char].range/660*1000+100))continue;
   ctx.strokeStyle=teamOfSeat(playerSeat(a.owner))==='blue'?'#9ce6ff':'#ffbdc8';
   ctx.lineWidth=p.char==='sniper'?4:3;
   ctx.beginPath();ctx.arc(pt.x,pt.y,p.char==='sniper'?6:4,0,Math.PI*2);ctx.stroke();
   earlyShotStats.shown++;
  }
  if(points.every(pt=>!!projectiles[pt.id])){
   earlyShots.delete(id);earlyShotStats.hostHandoffs++;
  }
 }
}
function bomberSmoothPoint(u,f,dt){
 const goal={x:u.fromX+(u.x-u.fromX)*f,
  y:u.fromY+(u.y-u.fromY)*f-Math.sin(f*Math.PI)*80};
 const prev=earlyBombSmoothing.get(u.key);
 if(!prev)return goal;
 const alpha=1-Math.exp(-24*Math.max(0,dt));
 prev.x+=(goal.x-prev.x)*alpha;prev.y+=(goal.y-prev.y)*alpha;
 if(Math.hypot(prev.x-goal.x,prev.y-goal.y)<2)earlyBombSmoothing.delete(u.key);
 return prev;
}
