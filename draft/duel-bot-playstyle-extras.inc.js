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
      smoke:[],holo:[],beacons:{},blast:[],bombs:[],slow:{},gadgetEquipped:{},gameRound:0};
    extraButton();
  }
  extraReset();
  function extraSideActor(side){return side==='host'?local:remote;}
  function extraOther(side){return side==='host'?'guest':'host';}
  function extraGadget(side){
    if(!extraState)return null;
    const available=extraGadIds.filter(id=>draftHas(side,id));
    if(!available.length)return null;
    if(!available.includes(extraState.gadgetEquipped[side]))extraState.gadgetEquipped[side]=available[0];
    return extraState.gadgetEquipped[side];
  }
  function extraStartRound(){
    if(!solo)return;
    extraState.used={};extraState.blastCD={};extraState.recoilCD={};
    extraState.gadgetCD={};extraState.wall=[];extraState.mines=[];
    extraState.smoke=[];extraState.holo=[];extraState.beacons={};
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
      if(e.pointerType==='mouse'||b.disabled)return;
      e.preventDefault();e.stopPropagation();b.dataset.justTouched=String(performance.now());
      extraUseGadget('host');
    },{passive:false});
    b.addEventListener('click',e=>{
      if(performance.now()-Number(b.dataset.justTouched||0)<650)return;
      extraUseGadget('host');
    });
    document.getElementById('controls').prepend(b);
    window.addEventListener('keydown',e=>{if(e.key.toLowerCase()==='f'&&!e.repeat)extraUseGadget('host');});
    extraButton();
  }
  function extraButton(){
    const b=document.getElementById('extraGadgetBtn');if(!b)return;
    const g=extraGadget('host'),remaining=Math.max(0,(extraState.gadgetCD.host||0)-time());
    const enabled=!!(g&&solo&&game?.phase==='playing'&&time()>=game.startAt&&!remaining);
    const name=g?draftById.get(g).name:'GAD2';
    b.classList.toggle('hidden',!g||!solo||document.getElementById('appStage').dataset.scene!=='game');
    b.disabled=!enabled;
    const beacon=g==='warp_beacon'&&extraState.beacons.host;
    const txt=beacon?'RETURN':remaining>0?Math.ceil(remaining/1000)+'s':g?'GAD2':'GAD2';
    if(b.textContent!==txt)b.textContent=txt;
    b.title=name;
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
  function extraDecoy(side){
    return extraState.holo.find(h=>h.side===side&&h.until>time())||null;
  }
  function extraUseGadget(side){
    if(!solo||!isPlaying()||!game||game.phase!=='playing'||game.hp[side]<=0)return false;
    const g=extraGadget(side),a=extraSideActor(side),now=time();
    if(!g||(extraState.gadgetCD[side]||0)>now)return false;
    if(g==='portable_wall'){
      const x=a.x+Math.cos(a.angle)*78,y=a.y+Math.sin(a.angle)*78;
      if(x<45||x>W-45||y<45||y>H-45||circleWall(x,y,45)||Math.hypot(x-local.x,y-local.y)<55||Math.hypot(x-remote.x,y-remote.y)<55)return false;
      extraState.wall=extraState.wall.filter(w=>w.side!==side&&w.until>now);
      extraState.wall.push({side,x,y,width:56,height:48,until:now+4000});
      extraState.gadgetCD[side]=now+12000;
    }else if(g==='trap_mine'){
      const x=a.x+Math.cos(a.angle)*44,y=a.y+Math.sin(a.angle)*44;
      if(circleWall(x,y,12))return false;
      extraState.mines=extraState.mines.filter(m=>m.side!==side&&m.until>now);
      extraState.mines.push({side,x,y,until:now+9000});
      extraState.gadgetCD[side]=now+12000;
    }else if(g==='hologram'){
      const d={side,x:a.x,y:a.y,angle:a.angle,char:a.char,until:now+7000};
      extraState.holo=extraState.holo.filter(h=>h.side!==side&&h.until>now);
      extraState.holo.push(d);
      extraState.gadgetCD[side]=now+14000;
    }else if(g==='warp_beacon'){
      const old=extraState.beacons[side];
      if(old&&old.until>now){
        if(Math.hypot(a.x-old.x,a.y-old.y)>260||circleWall(old.x,old.y,RADIUS+3))return false;
        const dx=old.x-a.x,dy=old.y-a.y,n=Math.ceil(Math.hypot(dx,dy)/6);
        // Segment check rejects teleporting through walls; never snap through cover.
        for(let i=1;i<=n;i++)if(circleWall(a.x+dx*i/n,a.y+dy*i/n,RADIUS+3))return false;
        a.x=old.x;a.y=old.y;delete extraState.beacons[side];extraState.gadgetCD[side]=now+15000;
      }else{
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
      const dx=-Math.cos(angle)*22,dy=-Math.sin(angle)*22;
      // Reuse canonical player-wall collisions, moved in short non-tunneling steps.
      for(let i=0;i<5;i++)moveWithWall(actor,dx/5,dy/5);
      extraState.recoilCD[side]=now+1200;
      fx.push({type:'dash',x:actor.x,y:actor.y,angle,ttl:.25,max:.25});
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
      const a=extraSideActor(h.side);
      // A deterministic forward/lateral decoy glide, with wall collision checks.
      const vx=Math.cos(h.angle)*42*dt,vy=Math.sin(h.angle)*42*dt;
      moveWithWall(h,vx,vy);
      h.angle=a.angle;
    }
    extraState.holo=extraState.holo.filter(h=>h.until>now);
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
      ctx.fillStyle='#3e9fb6';ctx.strokeStyle='#b9faff';ctx.lineWidth=3;
      ctx.fillRect(w.x-w.width/2,w.y-w.height/2,w.width,w.height);
      ctx.strokeRect(w.x-w.width/2,w.y-w.height/2,w.width,w.height);
    }
    for(const m of extraState.mines){
      if(m.until<=now)continue;
      ctx.fillStyle='#d8a45d';ctx.beginPath();ctx.arc(m.x,m.y,10,0,Math.PI*2);ctx.fill();
    }
    for(const s of extraState.smoke){
      if(s.until<=now)continue;
      ctx.fillStyle='rgba(177,194,206,.37)';ctx.beginPath();ctx.arc(s.x,s.y,s.radius,0,Math.PI*2);ctx.fill();
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
    for(const s of ['host','guest']){
      const b=extraState.beacons[s];
      if(!b||b.until<=now)continue;
      ctx.fillStyle=s==='host'?'#92f9ef':'#ff8ea5';
      ctx.beginPath();ctx.arc(b.x,b.y,12,0,Math.PI*2);ctx.fill();
    }
    ctx.restore();
    for(const h of extraState.holo){
      if(h.until<=now)continue;
      const p={...h,boost:0,overdrive:0,ammo:3,reload:0};
      ctx.save();ctx.globalAlpha=.75;
      drawCharacter(p,h.side==='host');
      ctx.restore();
    }
  }
  window.__brawlPlaystyleQA=()=>({
    cards:EXTRA_CARDS.map(c=>c.id),manual:[...extraManualDeck],owned:structuredClone(draftOwned),
    gadget:extraGadget('host'),state:structuredClone(extraState),
    choose:(cards)=>{if(!Array.isArray(cards)||cards.length>3||cards.some(id=>!draftById.has(id)))return false;extraManualDeck=[...cards];return true;},
    useGadget:()=>extraUseGadget('host'),
    fire:(angle=0)=>{if(!solo||!isPlaying())return false;shoot(false,angle);return true;}
  });
