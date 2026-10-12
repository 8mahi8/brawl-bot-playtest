// Shared deterministic combat HP bookkeeping and round outcomes.
// Invoked ONLY inside the existing authoritative BrawlCombatV8 reducer.
// UI, Firebase room authority, and mode-specific health regeneration are unchanged.
const BrawlMatchV1=Object.freeze({
 applyHit(g,h,t,balance,{guardian=null,guardFactor=.65}={}){
  if(!(g.hp[h.victim]>0))return null;
  const before=g.hp[h.victim];
  const amount=Math.min(guardian?Math.max(1,Math.round(h.amount*guardFactor)):h.amount,before);
  const saved=guardian?Math.max(0,Math.min(h.amount,before)-amount):0;
  if(saved>0)g.stats[guardian].guardSaved=(g.stats[guardian].guardSaved||0)+saved;
  g.hp[h.victim]-=amount;
  if(g.stats[h.owner])g.stats[h.owner].ult=Math.min(100,g.stats[h.owner].ult+amount*.48);
  g.stats[h.victim].ult=Math.min(100,g.stats[h.victim].ult+amount*(g.stats[h.victim].char==='tank'?.44:.24));
  g.reveals[h.victim]=t+1500;
  if(h.enhanced)g.debuffs[h.victim]={
   life:g.stats[h.victim].life,owner:h.owner,slowUntil:t+balance.bomberSlowMs,
   dotUntil:t+balance.bomberDotMs,dotNextAt:t+balance.bomberDotEveryMs,dotId:h.key
  };
  return {amount,saved,guardian};
 },
 resolve(g,{seatKeys,teamOf,targets,flying,center,dt,t,wallNow,balance}){
  if(g.mode==='area'){
   const inside={blue:0,red:0};
   for(const k of seatKeys){
    const id=g.seats[k].id,p=targets[id];
    if(g.hp[id]>0&&!(g.protection[id]>t)&&!flying(g,id)&&Math.hypot(p.x-center.x,p.y-center.y)<=balance.areaRadius)
     inside[teamOf(k)]++;
   }
   const a=g.area,contested=inside.blue>0&&inside.red>0;
   a.occupants=inside;a.contested=contested;
   if(!contested){
    if(inside.blue)a.blueMs=Math.min(balance.areaCaptureMs,a.blueMs+dt);
    if(inside.red)a.redMs=Math.min(balance.areaCaptureMs,a.redMs+dt);
   }
   let winner=null;
   if(a.blueMs===balance.areaCaptureMs||a.redMs===balance.areaCaptureMs)
    winner=a.blueMs===a.redMs?'draw':a.blueMs===balance.areaCaptureMs?'blue':'red';
   else if(t>=balance.areaLimitMs)
    winner=a.blueMs===a.redMs?'draw':a.blueMs>a.redMs?'blue':'red';
   if(winner){g.phase='match_end';g.winner=winner;g.endedAt=wallNow;if(winner!=='draw')g.scores[winner]=1;}
   return winner;
  }
  const live={blue:0,red:0};
  for(const k of seatKeys)if(g.hp[g.seats[k].id]>0)live[teamOf(k)]++;
  if(!live.blue||!live.red){
   const winner=!live.blue&&!live.red?'draw':!live.blue?'red':'blue';
   if(winner!=='draw')g.scores[winner]++;
   g.phase=winner!=='draw'&&g.scores[winner]>=2?'match_end':'round_end';
   g.winner=winner;g.endedAt=wallNow;return winner;
  }
  return null;
 },
 regenAmount(hp,maxHp,dtMs,fraction=.12){
  if(!(hp>0)||hp>=maxHp)return hp;
  return Math.min(maxHp,Math.round((hp+maxHp*fraction*dtMs/1000)*100)/100);
 }
});
