// Single-source 1vs1/2vs2 authoritative ammunition refill and volley creation.
// Inlined within BrawlCombatV8.create scope; uses BrawlWeaponV1 and chars/seatOf/team.
  function ammo(s,t){const q={...s},rate=q.char==='gunner'&&q.overdriveUntil>t?BrawlWeaponV1.overdriveReloadMs:chars[q.char].reload;
   if(q.ammo>=3){q.ammo=3;q.refillAt=0;return q;}
   if(q.refillAt>0&&t>=q.refillAt){const n=Math.floor((t-q.refillAt)/rate)+1;q.ammo=Math.min(3,q.ammo+n);q.refillAt=q.ammo===3?0:q.refillAt+n*rate;}return q;
  }
  function burst(a,s,g){const spread=BrawlWeaponV1.spread(s.char),seat=seatOf(g,a.owner);
   return spread.map((d,i)=>({id:a.eventId+':'+i,owner:a.owner,ownerLife:s.life,team:team(seat),x:a.x+Math.cos(a.angle)*28,y:a.y+Math.sin(a.angle)*28,vx:Math.cos(a.angle+d)*BrawlWeaponV1.bulletSpeed,vy:Math.sin(a.angle+d)*BrawlWeaponV1.bulletSpeed,dist:0,range:chars[s.char].range,radius:s.char==='sniper'?5:6,damage:chars[s.char].damage,char:s.char}));
  }
