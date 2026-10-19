function enemyCandidate(){if(!lobby||!game)return null;const mine=myTeam();let selected=null,dist=Infinity;
 for(const k of SEATS){if(teamOfSeat(k)===mine)continue;const seat=lobby.seats?.[k];if(!seat||!alive(seat.id))continue;const pos=targetPoint(seat.id);const d=Math.hypot(pos.x-local.x,pos.y-local.y);
 if(!canSeeEnemy(pos,seat.id))continue;
 if(game?.stats?.[myId]?.char!=='bomber'&&shotLineBlocked(local.x,local.y,pos.x,pos.y))continue;
 if(d<dist){dist=d;selected=pos;}
 }return selected;
}
function shootAngle(angle,reach=300){if(botPilot||!combatReady()||!alive(myId)||engine().flying(game,myId)||!Number.isFinite(angle))return;
 const stats=game.stats?.[myId],ammo=derivedAmmo(stats,combatNow()).ammo;if(!stats||ammo<=0)return;
 if(performance.now()-lastShootLocal<(stats.char==='gunner'&&(stats.overdriveUntil||0)>combatNow()?105:160))return;lastShootLocal=performance.now();local.a=angle;
 const attack={owner:myId,matchId:game.matchId,round:game.round,seq:actionSeq=Math.max(actionSeq,stats.lastActionSeq||0)+1,type:'shot',life:stats.life,connectionId:myConnection,reach:Math.round(clamp(reach,55,330)),x:Math.round(local.x),y:Math.round(local.y),angle:Math.round(angle*1000)/1000,at:Math.round(serverNow())};
 submitAction(attack,'射撃送信失敗 ');
}
function bulletSpecs(action,char){const s=CHARS[char];if(!s||char==='bomber')return[];const specs=char==='tank'?[-.20,-.10,0,.10,.20]:char==='gunner'?[-.075,0,.075]:[0];
 return specs.map((d,i)=>({id:action.eventId+':'+i,owner:action.owner,team:teamOfSeat(playerSeat(action.owner)),x:action.x+Math.cos(action.angle)*28,y:action.y+Math.sin(action.angle)*28,vx:Math.cos(action.angle+d)*660,vy:Math.sin(action.angle+d)*660,range:s.range,dist:0,radius:char==='sniper'?5:6,damage:s.damage,sniper:char==='sniper',life:0,spawnAt:performance.now()+(char==='gunner'?i*(game?.stats?.[action.owner]?.overdriveUntil>combatNow()?57:105):0)}));
}
