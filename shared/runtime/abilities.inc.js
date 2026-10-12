// Shared GAD/ULT semantics. Explicitly excludes mode-specific Tank GAD guardian targeting.
// Built into both offline HTML candidates; host reducer chooses whether to apply these.
const BrawlAbilityV1=Object.freeze({
 gunnerGadgetBoostMs:__GUNNER_GADGET_MS__,
 gunnerUltOverdriveMs:__GUNNER_ULT_MS__,
 sniperGadgetRange:__SNIPER_GADGET_RANGE__,
 sniperGadgetDamage:__SNIPER_GADGET_DAMAGE__,
 sniperLaserMs:__SNIPER_LASER_MS__,
 tankDashDistance:__TANK_DASH__,
 tankUltDefaultReach:__TANK_ULT_REACH__,
 guardianLinkMs:__GUARDIAN_LINK_MS__,
 bomberUltProjectiles:__BOMBER_ULT_COUNT__,
 gadget(g,s,a,pos,t,input,{seatKeys,team,seatOf,point,motion,move}){
  const char=s.char;
  if(char==='gunner'){s.ammo=3;s.refillAt=0;s.boostUntil=t+this.gunnerGadgetBoostMs;return true;}
  if(char==='bomber'){s.ammo=Math.min(3,s.ammo+1);if(s.ammo===3)s.refillAt=0;s.armed=true;return true;}
  if(char!=='sniper')return false;
  for(const k of seatKeys){
   const id=g.seats[k].id;
   if(team(k)===team(seatOf(g,a.owner))||!(g.hp[id]>0))continue;
   const p=point(g,id,input),d=Math.hypot(p.x-pos.x,p.y-pos.y);
   if(d>this.sniperGadgetRange)continue;
   const dx=d?(p.x-pos.x)/d:1,dy=d?(p.y-pos.y)/d:0;
   g.scheduled[a.eventId+':'+id]={kind:'shock',owner:a.owner,ownerLife:s.life,key:a.eventId+':'+id,victim:id,victimLife:g.stats[id].life,until:t,damage:this.sniperGadgetDamage,x:p.x,y:p.y};
   motion(g,id,move(p,dx*BrawlWeaponV1.sniperKnockback,dy*BrawlWeaponV1.sniperKnockback));
  }
  return true;
 },
 ultimate(g,s,a,pos,t,{landing,jumpDuration,balance}){
  const char=s.char;
  if(char==='tank'){
   const dst=landing(pos,a.angle,a.reach||this.tankUltDefaultReach);
   if(!dst.valid)return {ok:false,reason:'landing'};
   g.scheduled[a.eventId]={kind:'jump',owner:a.owner,ownerLife:s.life,matchId:g.matchId,round:g.round,key:a.eventId,x:dst.x,y:dst.y,fromX:pos.x,fromY:pos.y,angle:a.angle,start:t,until:t+jumpDuration(Math.hypot(dst.x-pos.x,dst.y-pos.y))};
  }else if(char==='sniper'){
   g.scheduled[a.eventId]={kind:'laser',owner:a.owner,ownerLife:s.life,matchId:g.matchId,round:g.round,key:a.eventId,x:pos.x,y:pos.y,angle:a.angle,start:t,until:t+this.sniperLaserMs};
  }else if(char==='bomber'){
   const dst=landing(pos,a.angle,Math.min(a.reach||balance.bomberRange,balance.bomberRange));
   for(let i=0;i<this.bomberUltProjectiles;i++){
    g.scheduled[a.eventId+':'+i]={kind:'bomb',owner:a.owner,ownerLife:s.life,matchId:g.matchId,round:g.round,key:a.eventId+':'+i,x:dst.x,y:dst.y,fromX:pos.x,fromY:pos.y,start:t+i*balance.bomberUltGap,until:t+balance.bomberFlightMs+i*balance.bomberUltGap,damage:balance.bomberUltDamage,radius:balance.bomberUltRadius,enhanced:false};
   }
  }else if(char==='gunner')s.overdriveUntil=t+this.gunnerUltOverdriveMs;
  else return {ok:false,reason:'unsupported_ability'};
  return {ok:true};
 }
});
