// BRAWL Tactical Draft: OFFLINE BOT playstyle cards, game-engine hook functions.
// Inlined only in the isolated BOT playtest HTML, not normal/online releases.
// This is a first interactive balancing build; does not use Firebase.
  const EXTRA_CARDS=[
    {id:'split_round',name:'分裂弾',family:'shot_mod',desc:'中央弾が遠距離で2発に分裂（各60%）'},
    {id:'ricochet',name:'跳弾',family:'shot_mod',desc:'通常弾が壁で1回だけ反射（威力70%）'},
    {id:'recoil_shot',name:'反動射撃',family:'shot_mod',desc:'通常射撃+10%・発射時に後ろへ22移動'},
    {id:'delayed_blast',name:'遅延爆発',family:'shot_mod',desc:'命中で0.7秒後に小爆発（射撃1回に1個）'},
    {id:'portable_wall',name:'ポータブルウォール',family:'gadget2',desc:'GAD2：4秒続く小さな遮蔽物'},
    {id:'trap_mine',name:'トラップマイン',family:'gadget2',desc:'GAD2：近付く敵に小ダメージ＋鈍足'},
    {id:'hologram',name:'ホログラム',family:'gadget2',desc:'GAD2：最大7秒間の囮を出す'},
    {id:'warp_beacon',name:'ワープビーコン',family:'gadget2',desc:'GAD2：設置したビーコンに戻る'},
    {id:'smoke',name:'スモーク',family:'gadget2',desc:'GAD2：射線上の視認を妨げる煙幕'}
  ];
  DRAFT_CARDS.push(...EXTRA_CARDS);
  for(const c of EXTRA_CARDS)draftById.set(c.id,c);
  const extraGadIds=EXTRA_CARDS.filter(c=>c.family==='gadget2').map(c=>c.id);
  let extraManualDeck=[];
  let extraState;
  function extraReset(){
    extraState={seq:0,used:{},blastCD:{},recoilCD:{},gadgetCD:{},wall:[],mines:[],
      smoke:[],holo:[],fakeShots:[],beacons:{},blast:[],bombs:[],slow:{},gadgetEquipped:{},gameRound:0};
    extraButton();
  }
  extraReset();
  function extraSideActor(side){return side==='host'?local:remote;}
  function extraOther(side){return side==='host'?'guest':'host';}
  function extraGadget(side){
    if(!extraState)return null;
    const available=(draftOwned[side]||[]).filter(id=>extraGadIds.includes(id));
    if(!solo||!available.length)return null;
    if(!available.includes(extraState.gadgetEquipped[side]))
      extraState.gadgetEquipped[side]=available[available.length-1];
    return extraState.gadgetEquipped[side];
  }
  // The most recently acquired GAD2 card replaces the equipped GAD2, not the owned card slot.
  function extraOnDraftPick(side,id){
    if(!solo)return;
    if(extraGadIds.includes(id))extraState.gadgetEquipped[side]=id;
    else extraGadget(side); // Replacing a previously equipped card repairs the active slot.
    extraButton();
  }
  function extraStartRound(){
    if(!solo)return;
    extraState.used={};extraState.blastCD={};extraState.recoilCD={};
    extraState.gadgetCD={};extraState.wall=[];extraState.mines=[];
    extraState.smoke=[];extraState.holo=[];extraState.fakeShots=[];extraState.beacons={};
    extraState.blast=[];extraState.bombs=[];extraState.slow={};
    extraState.gameRound=game.round;
    extraGadget('host');extraGadget('guest');extraButton();
  }
  function extraCardSelectUI(){
    const overlay=document.getElementById('extraCardPicker');if(!overlay)return;
    const options=EXTRA_CARDS.map(c=>{
      const yes=extraManualDeck.includes(c.id);
      return '<label class="extraCardItem"><input type="checkbox" data-extra-id="'+c.id+'" '+(yes?'checked':'')+'><b>'+c.name+'</b><small>'+c.desc+'</small></label>';
    }).join('');
    overlay.innerHTML='<div class="extraModal"><h2>新カードを選んでBOTと試す</h2>'+
      '<p>最大3枚。未選択なら通常どおりドラフトで取得。ゲーム中は取得カードを使うよ。</p>'+
      '<div class="extraCardGrid">'+options+'</div>'+
      '<p id="extraPickCount">選択中：'+extraManualDeck.length+' / 3</p>'+
      '<button id="extraPickDone" class="btn" type="button">このカードで試す</button></div>';
    overlay.classList.remove('hidden');
  }
  function extraPickerInit(){
    const picker=document.createElement('div');picker.id='extraCardPicker';picker.className='hidden';
    picker.addEventListener('change',e=>{
      const input=e.target.closest('input[data-extra-id]');
      if(!input)return;
      const id=input.dataset.extraId;
      if(input.checked){
        if(extraManualDeck.length>=3){input.checked=false;return;}
        if(!extraManualDeck.includes(id))extraManualDeck.push(id);
      }else extraManualDeck=extraManualDeck.filter(x=>x!==id);
      document.getElementById('extraPickCount').textContent='選択中：'+extraManualDeck.length+' / 3';
      const btn=document.getElementById('extraPickBtn');
      if(btn)btn.textContent=extraManualDeck.length?'選択カード：'+extraManualDeck.map(x=>draftById.get(x).name).join(' / '):'新カードを選んで試す（任意）';
    });
    picker.addEventListener('click',e=>{
      if(e.target.id==='extraPickDone')picker.classList.add('hidden');
    });
    document.getElementById('appStage').appendChild(picker);
    const btn=document.createElement('button');btn.id='extraPickBtn';
    btn.type='button';btn.className='tinyBtn';btn.textContent='新カードを選んで試す（任意）';
    btn.addEventListener('click',extraCardSelectUI);
    document.getElementById('readyBtn').before(btn);
    const b=document.createElement('button');b.id='extraGadgetBtn';
    b.type='button';b.className='action';b.textContent='GAD2';b.disabled=true;
    b.addEventListener('pointerdown',e=>{
      if(startButtonDrag(e,'gadget2'))return;
      if(e.pointerType==='mouse'||b.disabled)return;
      e.preventDefault();e.stopPropagation();b.dataset.justTouched=String(performance.now());
      extraUseGadget('host');
    },{passive:false});
    b.addEventListener('pointermove',moveButtonDrag);
    b.addEventListener('pointerup',stopButtonDrag);
    b.addEventListener('pointercancel',stopButtonDrag);
    b.addEventListener('click',e=>{
      if(layoutEditing||performance.now()-Number(b.dataset.justTouched||0)<650)return;
      extraUseGadget('host');
    });
    document.getElementById('controls').prepend(b);
    applyButtonLayout();
    window.addEventListener('keydown',e=>{if(e.key.toLowerCase()==='f'&&!e.repeat)extraUseGadget('host');});
    extraButton();
  }
  function extraButton(){
    const b=document.getElementById('extraGadgetBtn');if(!b)return;
    const g=extraGadget('host'),remaining=Math.max(0,(extraState.gadgetCD.host||0)-time());
    const enabled=!!(g&&solo&&game?.phase==='playing'&&time()>=game.startAt&&!remaining);
    const name=g?draftById.get(g).name:'GAD2';
    b.classList.toggle('hidden',!layoutEditing&&(!g||!solo||document.getElementById('appStage').dataset.scene!=='game'));
    b.disabled=layoutEditing?false:!enabled;
    const beacon=g==='warp_beacon'&&extraState.beacons.host;
    const short={portable_wall:'壁',trap_mine:'地雷',hologram:'分身',
      warp_beacon:'ビーコン',smoke:'煙幕'}[g]||'GAD2';
    const txt=beacon?'帰還':remaining>0?short+'\\n'+Math.ceil(remaining/1000)+'秒':short;
    if(b.textContent!==txt)b.textContent=txt;
    b.title=name;b.setAttribute('aria-label','GAD2：'+name);
  }
  function extraWallCollision(x,y,r){
    if(!solo||!extraState)return false;
    return extraState.wall.some(w=>w.until>time()&&
       x+r>w.x-w.width/2&&x-r<w.x+w.width/2&&
       y+r>w.y-w.height/2&&y-r<w.y+w.height/2);
  }
  function extraSmokeHidden(side,viewer){
    if(!solo||side===viewer)return false;
    const actor=extraSideActor(side),observer=extraSideActor(viewer);
    return extraState.smoke.some(s=>s.until>time()&&
      Math.hypot(actor.x-s.x,actor.y-s.y)<s.radius &&
      Math.hypot(observer.x-s.x,observer.y-s.y)>s.radius &&
      (extraState.used['reveal:'+side]||0)<=time());
  }
  function extraSmokeStatus(side){
    if(!solo)return 'none';
    const actor=extraSideActor(side),now=time();
    const inSmoke=extraState.smoke.some(s=>s.until>now&&Math.hypot(actor.x-s.x,actor.y-s.y)<s.radius);
    if(!inSmoke)return 'none';
    return extraSmokeHidden(side,extraOther(side))?'hidden':'revealed';
  }
  function extraDecoy(side){
    return extraState.holo.find(h=>h.side===side&&h.until>time())||null;
  }
  function extraSafeLanding(x,y,excludeSide=null){
    // Beacon was placed at a valid player position; new temporary walls can alter that.
    const enemy=excludeSide?extraSideActor(extraOther(excludeSide)):null;
    const safe=(px,py)=>px>=RADIUS+3&&px<=W-RADIUS-3&&py>=RADIUS+3&&py<=H-RADIUS-3&&
      !circleWall(px,py,RADIUS+3)&&(!enemy||Math.hypot(enemy.x-px,enemy.y-py)>=RADIUS*2+2);
    if(safe(x,y))return {x,y};
    for(const r of [24,40,58,76])for(let i=0;i<16;i++){
      const theta=i*Math.PI/8,px=x+Math.cos(theta)*r,py=y+Math.sin(theta)*r;
      if(safe(px,py))return {x:px,y:py};
    }
    return null;
  }
  function extraCanPlaceWall(x,y,width,height){
    if(x-width/2<6||x+width/2>W-6||y-height/2<6||y+height/2>H-6)return false;
    const collisions=[...walls,...extraState.wall.filter(w=>w.until>time()).map(w=>
      ({x:w.x-w.width/2,y:w.y-w.height/2,w:w.width,h:w.height}))];
    const overlap=(rect,r)=>rect.x<r.x+r.w&&rect.x+rect.w>r.x&&rect.y<r.y+r.h&&rect.y+rect.h>r.y;
    const box={x:x-width/2,y:y-height/2,w:width,h:height};
    if(collisions.some(w=>overlap(box,w)))return false;
    const near=(p)=>Math.abs(p.x-x)<width/2+RADIUS+6&&Math.abs(p.y-y)<height/2+RADIUS+6;
    return !near(local)&&!near(remote);
  }
  function extraUseGadget(side){
    if(!solo||!isPlaying()||!game||game.phase!=='playing'||game.hp[side]<=0)return false;
    const g=extraGadget(side),a=extraSideActor(side),now=time();
    if(!g||(extraState.gadgetCD[side]||0)>now)return false;
    if(g==='portable_wall'){
      // Tall vertical cover, narrow enough not to trap either player.
      const width=42,height=112,x=a.x+Math.cos(a.angle)*95,y=a.y+Math.sin(a.angle)*95;
      if(!extraCanPlaceWall(x,y,width,height)){if(side==='host')actionFeedback('壁を設置できない場所','extraGadgetBtn');return false;}
      extraState.wall=extraState.wall.filter(w=>w.side!==side&&w.until>now);
      extraState.wall.push({side,x,y,width,height,until:now+4000});
      extraState.gadgetCD[side]=now+12000;
    }else if(g==='trap_mine'){
      const x=a.x+Math.cos(a.angle)*44,y=a.y+Math.sin(a.angle)*44;
      if(circleWall(x,y,12))return false;
      extraState.mines=extraState.mines.filter(m=>m.side!==side&&m.until>now);
      extraState.mines.push({side,x,y,until:now+9000});
      extraState.gadgetCD[side]=now+12000;
    }else if(g==='hologram'){
      // Spawn at the owner's location, then use its own strafe/approach/retreat AI.
      const d={side,x:a.x,y:a.y,angle:a.angle,char:a.char,until:now+7000,
        born:now,fireAt:now+800,strafe:side==='host'?1:-1,swapAt:now+1350,shotCount:0};
      extraState.holo=extraState.holo.filter(h=>h.side!==side&&h.until>now);
      extraState.holo.push(d);
      extraState.gadgetCD[side]=now+14000;
    }else if(g==='warp_beacon'){
      const old=extraState.beacons[side];
      if(old&&old.until>now){
        // This is a WARP, not a dash: intervening walls and distance must not silently block return.
        const landing=extraSafeLanding(old.x,old.y,side);
        if(!landing){if(side==='host')actionFeedback('帰還地点がふさがっている','extraGadgetBtn');return false;}
        fx.push({type:'impact',x:a.x,y:a.y,ttl:.32,max:.32});
        a.x=landing.x;a.y=landing.y;
        fx.push({type:'impact',x:a.x,y:a.y,ttl:.32,max:.32});
        delete extraState.beacons[side];extraState.gadgetCD[side]=now+15000;
      }else{
        if(circleWall(a.x,a.y,RADIUS+3))return false;
        extraState.beacons[side]={x:a.x,y:a.y,until:now+7000};
      }
    }else if(g==='smoke'){
      extraState.smoke=extraState.smoke.filter(s=>s.side!==side&&s.until>now);
      extraState.smoke.push({side,x:a.x+Math.cos(a.angle)*48,y:a.y+Math.sin(a.angle)*48,radius:100,until:now+4000});
      extraState.gadgetCD[side]=now+12000;
    }else return false;
    if(side==='host')actionFeedback(draftById.get(g).name,'extraGadgetBtn');
    extraButton();return true;
  }
  function extraOnFire(side,actor,angle){
    const id='playstyle_'+game.round+'_'+(++extraState.seq);
    const now=time();
    extraState.used['reveal:'+side]=now+700;
    if(solo&&draftHas(side,'recoil_shot')&&(extraState.recoilCD[side]||0)<=now){
      const dx=-Math.cos(angle)*60,dy=-Math.sin(angle)*60;
      // Visible recoil: 60 world units, ten small safe steps; never bypass solid walls.
      for(let i=0;i<10;i++)moveWithWall(actor,dx/10,dy/10);
      extraState.recoilCD[side]=now+1200;
      fx.push({type:'dash',x:actor.x,y:actor.y,angle,ttl:.36,max:.36});
    }
    return id;
  }
  function extraSplitBomb(side,actor,angle,reach,fireId){
    if(!solo||!draftHas(side,'split_round'))return false;
    const distance=clamp(reach,55,BALANCE.bomberRange),x=actor.x+Math.cos(angle)*distance,y=actor.y+Math.sin(angle)*distance;
    const px=-Math.sin(angle),py=Math.cos(angle),now=time();
    for(const sign of [-1,1]){
      extraState.bombs.push({side,x:x+px*30*sign,y:y+py*30*sign,damage:BALANCE.bomberDamage*.5*(draftHas(side,'recoil_shot')?1.10:1),radius:BALANCE.bomberRadius*.72,
        due:now+BALANCE.bomberFlightMs,round:game.round,fireId});
    }
    fx.push({type:'impact',x,y,ttl:.35,max:.35});
    return true;
  }
  function extraSplitShot(b){
    if(!solo||!b.splitCenter||b.ult||b.splitChild||b.dist<b.range*.5||!draftHas(b.owner,'split_round'))return null;
    const a=Math.atan2(b.vy,b.vx),speed=Math.hypot(b.vx,b.vy);
    return [-1,1].map(sign=>({...b,id:b.id+':split:'+sign,splitCenter:false,splitChild:true,
      ricochetUsed:0,damageScale:(b.damageScale||1)*.6,
      vx:Math.cos(a+sign*.21)*speed,vy:Math.sin(a+sign*.21)*speed}));
  }
  function extraBounceStep(b,dt,targetHit){
    const speed=Math.hypot(b.vx,b.vy),steps=Math.max(1,Math.ceil(speed*dt/6));
    for(let i=0;i<steps;i++){
      const px=b.x,py=b.y,dx=b.vx*dt/steps,dy=b.vy*dt/steps;
      b.x+=dx;b.y+=dy;b.dist+=Math.hypot(dx,dy);
      if(b.x<0||b.x>W||b.y<0||b.y>H)return false;
      if(circleWall(b.x,b.y,b.radius)){
        if(b.ricochetUsed)return false;
        b.x=px;b.y=py;b.ricochetUsed=1;b.damageScale=(b.damageScale||1)*.7;
        if(circleWall(px+dx,py,b.radius))b.vx*=-1;
        else b.vy*=-1;
        continue;
      }
      if(targetHit(b)||b.dist>=b.range)return false;
    }
    return true;
  }
  function extraAbsorbDecoy(b,victim){
    if(!solo||b.ult)return false;
    const h=extraDecoy(victim);
    if(!h||b.owner===victim||Math.hypot(h.x-b.x,h.y-b.y)>RADIUS+b.radius)return false;
    extraState.holo=extraState.holo.filter(x=>x!==h);
    fx.push({type:'impact',x:h.x,y:h.y,ttl:.3,max:.3});
    return true;
  }
  function extraOnBulletHit(b){
    if(!solo||b.ult||!b.fireId||!draftHas(b.owner,'delayed_blast'))return;
    const now=time();
    if(extraState.used['blast:'+b.fireId]||(extraState.blastCD[b.owner]||0)>now)return;
    extraState.used['blast:'+b.fireId]=true;
    extraState.blastCD[b.owner]=now+3000;
    extraState.blast.push({side:b.owner,x:b.x,y:b.y,due:now+700,radius:55,damage:10,round:game.round});
  }
  function extraTick(dt){
    if(!solo||game?.phase!=='playing'||!extraState)return;
    const now=time();
    extraState.wall=extraState.wall.filter(w=>w.until>now);
    extraState.smoke=extraState.smoke.filter(s=>s.until>now);
    for(const h of extraState.holo){
      if(h.until<=now)continue;
      // Harmless bot-like decoy AI: independent aim, strafing, range control and blank fire.
      const enemy=extraSideActor(extraOther(h.side));
      const dx=enemy.x-h.x,dy=enemy.y-h.y,dist=Math.hypot(dx,dy)||1;
      const aim=Math.atan2(dy,dx),ux=dx/dist,uy=dy/dist;
      if(now>=h.swapAt){h.strafe*=-1;h.swapAt=now+1350;}
      const ideal=h.char==='sniper'?225:h.char==='tank'?115:170;
      const drive=dist>ideal+25?1:dist<ideal-25?-.8:0;
      const vx=ux*drive-uy*h.strafe*.72,vy=uy*drive+ux*h.strafe*.72;
      const mag=Math.hypot(vx,vy)||1,prevX=h.x,prevY=h.y;
      moveWithWall(h,vx/mag*97*dt,vy/mag*97*dt);
      // If cover blocks pursuit, sidestep, rather than remaining a stationary hologram.
      if(Math.hypot(h.x-prevX,h.y-prevY)<.2)moveWithWall(h,-uy*h.strafe*90*dt,ux*h.strafe*90*dt);
      h.angle=aim;
      if(now>=h.fireAt&&dist<CHARS[h.char].range+110&&!lineBlocked(h.x,h.y,enemy.x,enemy.y,4)){
        // Fake shots are ONLY visual objects: not inserted into shots[] and never hit HP/ULT.
        const sx=h.x+Math.cos(aim)*22,sy=h.y+Math.sin(aim)*22;
        extraState.fakeShots.push({side:h.side,x:sx,y:sy,vx:Math.cos(aim)*390,
          vy:Math.sin(aim)*390,ttl:.38,damage:0});
        h.fireAt=now+(h.char==='tank'?1050:850);h.shotCount++;
      }
    }
    extraState.holo=extraState.holo.filter(h=>h.until>now);
    for(const shot of extraState.fakeShots){
      shot.x+=shot.vx*dt;shot.y+=shot.vy*dt;shot.ttl-=dt;
    }
    extraState.fakeShots=extraState.fakeShots.filter(s=>s.ttl>0&&!circleWall(s.x,s.y,4));
    for(const s of ['host','guest'])if(extraState.beacons[s]?.until<=now)delete extraState.beacons[s];
    for(const m of [...extraState.mines]){
      if(m.until<=now){extraState.mines.splice(extraState.mines.indexOf(m),1);continue;}
      const side=extraOther(m.side),actor=extraSideActor(side);
      if(Math.hypot(actor.x-m.x,actor.y-m.y)<RADIUS+20){
        extraState.mines.splice(extraState.mines.indexOf(m),1);
        extraState.slow[side]=now+1400;
        applySoloDamage(side,8,m.side,m.x,m.y,'effect');
        if(game.phase!=='playing')return;
      }
    }
    for(const arr of [extraState.blast,extraState.bombs]){
      for(const blast of [...arr]){
        if(blast.due>now)continue;
        arr.splice(arr.indexOf(blast),1);
        if(blast.round!==game.round)continue;
        fx.push({type:'impact',x:blast.x,y:blast.y,ttl:.32,max:.32});
        const side=extraOther(blast.side),actor=extraSideActor(side);
        if(Math.hypot(actor.x-blast.x,actor.y-blast.y)<blast.radius+RADIUS){
          if(blast.fireId)extraOnBulletHit({owner:blast.side,fireId:blast.fireId,x:blast.x,y:blast.y,ult:false});
          applySoloDamage(side,blast.damage,blast.side,blast.x,blast.y,'effect');
          if(game.phase!=='playing')return;
        }
      }
    }
    extraButton();
  }
  function extraDraw(){
    if(!solo||!extraState||!game||!['playing','round_end'].includes(game.phase))return;
    const now=time();ctx.save();
    for(const w of extraState.wall){
      if(w.until<=now)continue;
      const x=w.x-w.width/2,y=w.y-w.height/2,alpha=Math.min(1,(w.until-now)/550);
      ctx.fillStyle='rgba(35,119,157,'+(.65*alpha)+')';ctx.strokeStyle='#a1f5ff';ctx.lineWidth=3;
      ctx.fillRect(x,y,w.width,w.height);ctx.strokeRect(x,y,w.width,w.height);
      ctx.strokeStyle='rgba(180,247,255,.6)';ctx.lineWidth=2;
      ctx.beginPath();ctx.moveTo(w.x,y+10);ctx.lineTo(w.x,y+w.height-10);ctx.stroke();
    }
    for(const m of extraState.mines){
      if(m.until<=now)continue;
      ctx.fillStyle='#d8a45d';ctx.beginPath();ctx.arc(m.x,m.y,10,0,Math.PI*2);ctx.fill();
    }
    for(const s of extraState.smoke){
      if(s.until<=now)continue;
      ctx.fillStyle='rgba(110,137,167,.52)';ctx.beginPath();ctx.arc(s.x,s.y,s.radius,0,Math.PI*2);ctx.fill();
      ctx.strokeStyle='rgba(190,221,249,.68)';ctx.lineWidth=2.5;ctx.setLineDash([9,10]);
      ctx.beginPath();ctx.arc(s.x,s.y,s.radius-3,0,Math.PI*2);ctx.stroke();ctx.setLineDash([]);
      for(let i=0;i<6;i++){
        const q=now/1200+i*1.047,rad=32+12*Math.sin(now/1100+i);
        ctx.fillStyle='rgba(222,241,253,.11)';ctx.beginPath();
        ctx.arc(s.x+Math.cos(q)*rad,s.y+Math.sin(q)*rad,31,0,Math.PI*2);ctx.fill();
      }
    }
    for(const b of extraState.blast){
      if(b.due<=now)continue;
      ctx.setLineDash([6,5]);ctx.strokeStyle='#ff9954';ctx.lineWidth=3;
      ctx.beginPath();ctx.arc(b.x,b.y,b.radius,0,Math.PI*2);ctx.stroke();
    }
    for(const b of extraState.bombs){
      if(b.due<=now)continue;
      ctx.setLineDash([4,4]);ctx.strokeStyle='#ffb75c';ctx.lineWidth=3;
      ctx.beginPath();ctx.arc(b.x,b.y,b.radius,0,Math.PI*2);ctx.stroke();
    }
    ctx.setLineDash([]);
    for(const shot of extraState.fakeShots){
      ctx.strokeStyle=shot.side==='host'?'rgba(158,247,255,.85)':'rgba(255,151,184,.82)';
      ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(shot.x,shot.y);
      ctx.lineTo(shot.x-shot.vx*.045,shot.y-shot.vy*.045);ctx.stroke();
    }
    for(const s of ['host','guest']){
      const b=extraState.beacons[s];
      if(!b||b.until<=now)continue;
      const left=Math.max(0,(b.until-now)/7000);
      ctx.fillStyle=s==='host'?'rgba(108,237,241,.3)':'rgba(255,139,165,.3)';
      ctx.beginPath();ctx.arc(b.x,b.y,18,0,Math.PI*2);ctx.fill();
      ctx.strokeStyle=s==='host'?'#a0ffff':'#ff9abb';ctx.lineWidth=3;
      ctx.beginPath();ctx.arc(b.x,b.y,12,0,Math.PI*2);ctx.stroke();
      ctx.beginPath();ctx.arc(b.x,b.y,12,-Math.PI/2,-Math.PI/2+2*Math.PI*left);ctx.stroke();
    }
    ctx.restore();
    for(const h of extraState.holo){
      if(h.until<=now)continue;
      const p={...h,boost:0,overdrive:0,ammo:3,reload:0};
      ctx.save();ctx.globalAlpha=.75;
      drawCharacter(p,h.side==='host',true);
      ctx.restore();
    }
  }
  window.__brawlPlaystyleQA=()=>({
    cards:EXTRA_CARDS.map(c=>c.id),manual:[...extraManualDeck],owned:structuredClone(draftOwned),
    gadget:extraGadget('host'),smokeStatus:extraSmokeStatus('host'),state:structuredClone(extraState),
    choose:(cards)=>{if(!Array.isArray(cards)||cards.length>3||cards.some(id=>!draftById.has(id)))return false;extraManualDeck=[...cards];return true;},
    useGadget:()=>extraUseGadget('host'),
    // QA-only: position edit is limited to this offline experimental BOT build.
    setLocalPosition:(x,y)=>{
      if(!solo||game?.phase!=='playing'||!Number.isFinite(x)||!Number.isFinite(y)||
         x<RADIUS||x>W-RADIUS||y<RADIUS||y>H-RADIUS||circleWall(x,y,RADIUS+3))return false;
      local.x=x;local.y=y;return true;
    },
    setBotPosition:(x,y)=>{
      if(!solo||game?.phase!=='playing'||!Number.isFinite(x)||!Number.isFinite(y)||
         x<RADIUS||x>W-RADIUS||y<RADIUS||y>H-RADIUS||circleWall(x,y,RADIUS+3))return false;
      remote.x=x;remote.y=y;remote.targetX=x;remote.targetY=y;return true;
    },
    setOffer:(ids)=>{
      if(!solo||game?.phase!=='round_end'||!Array.isArray(ids)||ids.length!==4||
         new Set(ids).size!==4||ids.some(id=>!draftById.has(id)))return false;
      draftOffer=[...ids];draftOfferTaken=new Set();draftOverlayRender();return true;
    },
    fire:(angle=0)=>{if(!solo||!isPlaying())return false;shoot(false,angle);return true;}
  });
