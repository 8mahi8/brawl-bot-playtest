// V0.1 offline BOT draft integration for the existing iPad DUEL engine.
// No Firebase calls. This module is inlined into the standalone lab HTML.
  const DRAFT_CARDS=[
    {id:'empty_sprint',name:'空弾疾走',family:'mobility',desc:'残弾0なら移動速度 +9%'},
    {id:'opening_guard',name:'先制防壁',family:'defense',desc:'6秒無被弾後の初撃を7軽減'},
    {id:'finisher',name:'仕留めの一押し',family:'pressure',desc:'HP35%以下へ通常攻撃 +5（8秒ごと）'},
    {id:'moving_reload',name:'走行装填',family:'reload',desc:'0.8秒以上の移動中、装填 +12%'},
    {id:'hit_stride',name:'追撃歩法',family:'mobility',desc:'通常攻撃命中後1.8秒間、移動 +7%'},
    {id:'clutch_armor',name:'崖際装甲',family:'defense',desc:'残HP35%以下で被ダメージ -8%'},
    {id:'last_shell',name:'最後の装填',family:'reload',desc:'残弾0の間、装填 +16%'},
    {id:'followthrough',name:'連続圧力',family:'pressure',desc:'同じ敵に2.5秒以内の通常攻撃 +3（8秒ごと）'}
  ];
  const draftById=new Map(DRAFT_CARDS.map(c=>[c.id,c]));
  let draftOwned={host:[],guest:[]},draftCD={host:{},guest:{}},
    draftBuff={host:{},guest:{}},draftMoveSince={host:null,guest:null},
    draftLastDamage={host:0,guest:0},draftLastNormal={host:-1,guest:-1},
    draftOffer=[],draftQueue=[],draftTurn=0,draftWinner='',draftTimer=null;
  function draftReset(){
    if(draftTimer){clearTimeout(draftTimer);draftTimer=null;}
    draftOwned={host:[],guest:[]};draftCD={host:{},guest:{}};
    draftBuff={host:{},guest:{}};draftMoveSince={host:null,guest:null};
    draftLastDamage={host:0,guest:0};draftLastNormal={host:-1,guest:-1};
    draftOffer=[];draftQueue=[];draftTurn=0;draftWinner='';
    const overlay=document.getElementById('draftOverlay');
    if(overlay)overlay.classList.add('hidden');
    draftHud();
  }
  function draftHas(side,id){return solo&&draftOwned[side]?.includes(id);}
  function draftReady(side,id,now=time()){return (draftCD[side]?.[id]||0)<=now;}
  function draftMovementRate(side){
    if(!solo)return 1;
    const now=time(),ammo=side==='host'?local.ammo:botBrain.ammo,b=draftBuff[side];
    let pct=0;
    if(draftHas(side,'empty_sprint')&&ammo===0)pct+=9;
    if(draftHas(side,'hit_stride')&&b.hitStrideUntil>now)pct+=7;
    return 1+Math.min(12,pct)/100;
  }
  function draftTrackMotion(side,moving){
    if(!solo)return;
    if(!moving)draftMoveSince[side]=null;
    else if(draftMoveSince[side]===null)draftMoveSince[side]=time();
  }
  function draftReloadRate(side){
    if(!solo)return 1;
    const ammo=side==='host'?local.ammo:botBrain.ammo;
    const moving=draftMoveSince[side]!==null&&time()-draftMoveSince[side]>=800;
    let pct=0;
    if(draftHas(side,'moving_reload')&&moving)pct+=12;
    if(draftHas(side,'last_shell')&&ammo===0)pct+=16;
    return 1+Math.min(20,pct)/100;
  }
  function draftAdjustHit(victim,amount,owner,kind){
    if(!solo)return amount;
    if(!owner||!['host','guest'].includes(owner)||kind!=='normal'){
      draftLastDamage[victim]=time();return amount;
    }
    const now=time(),attacker=owner,pre=game.hp[victim],maximum=maxHp(game.chars[victim]);
    let bonus=0;
    if(draftHas(attacker,'finisher')&&pre/maximum<=.35&&draftReady(attacker,'finisher',now)){
      bonus+=5;draftCD[attacker].finisher=now+8000;
    }
    if(draftHas(attacker,'followthrough')&&draftLastNormal[attacker]>=0&&
       now>draftLastNormal[attacker]&&now-draftLastNormal[attacker]<=2500&&
       draftReady(attacker,'followthrough',now)){
      bonus+=3;draftCD[attacker].followthrough=now+8000;
    }
    const raw=amount+Math.min(7,bonus);
    let pct=0,flat=0;
    if(draftHas(victim,'clutch_armor')&&pre/maximum<=.35)pct+=8;
    if(draftHas(victim,'opening_guard')&&now-draftLastDamage[victim]>=6000&&
       draftReady(victim,'opening_guard',now)){
      flat=7;draftCD[victim].opening_guard=now+14000;
    }
    const reduced=Math.max(0,Math.round(raw*(1-Math.min(12,pct)/100)-flat));
    draftLastDamage[victim]=now;
    if(reduced>0){
      draftLastNormal[attacker]=now;
      if(draftHas(attacker,'hit_stride')&&draftReady(attacker,'hit_stride',now)){
        draftBuff[attacker].hitStrideUntil=now+1800;draftCD[attacker].hit_stride=now+6000;
      }
    }
    return reduced;
  }
  function draftStartRound(){
    if(!solo)return;
    draftBuff={host:{},guest:{}};draftMoveSince={host:null,guest:null};
    draftLastNormal={host:-1,guest:-1};
    draftLastDamage={host:game.startAt,guest:game.startAt};
    draftHud();
  }
  function draftChooseOffer(winner){
    const enemy=winner==='host'?'guest':'host';
    const valid=[];
    const cards=DRAFT_CARDS;
    for(let a=0;a<cards.length;a++)for(let c=a+1;c<cards.length;c++)
     for(let d=c+1;d<cards.length;d++)for(let e=d+1;e<cards.length;e++){
      const offer=[cards[a],cards[c],cards[d],cards[e]];
      if(new Set(offer.map(x=>x.family)).size<3)continue;
      if(offer.filter(x=>!draftOwned[winner].includes(x.id)).length<1)continue;
      if(offer.filter(x=>!draftOwned[enemy].includes(x.id)).length<2)continue;
      valid.push(offer.map(x=>x.id));
     }
    if(!valid.length)throw Error('No pickable draft offer');
    return valid[(game.round*23+game.scores.host*7+game.scores.guest*13)%valid.length];
  }
  function draftHud(){
    const el=document.getElementById('draftHud');
    if(!el)return;
    el.classList.toggle('hidden',!solo||!game||game.phase==='select'||game.phase==='match_end');
    if(!solo||!game)return;
    const name=side=>draftOwned[side].map(id=>draftById.get(id).name).join('・')||'未取得';
    const value='戦術｜YOU：'+name('host')+'　/　BOT：'+name('guest');
    if(el.textContent!==value)el.textContent=value;
  }
  function draftOverlayRender(){
    const el=document.getElementById('draftOverlay');
    if(!el)return;
    const actor=draftQueue[draftTurn],yourTurn=actor==='host';
    const mine=draftOwned.host;
    const options=draftOffer.map(id=>{
      const c=draftById.get(id),taken=draftOfferTaken.has(id),owned=draftOwned[actor].includes(id);
      return '<button class="draftCard" data-draft-id="'+id+'" '+(taken||owned||!yourTurn?'disabled':'')+
       '><b>'+c.name+'</b><span>'+c.desc+'</span><small>'+c.family+'</small></button>';
    }).join('');
    const replace=mine.length>=3?
     '<label class="draftReplace">交換するカード：<select id="draftReplace">'+
       mine.map(id=>'<option value="'+id+'">'+draftById.get(id).name+'</option>').join('')+
      '</select></label>':'';
    el.innerHTML='<div class="draftPanel"><div class="draftEyebrow">TACTICAL DRAFT · '+game.round+' → '+(game.round+1)+'</div>'+
      '<h2>'+ (yourTurn?'君のカードを選ぼう':'BOTが先にカードを選択中') +'</h2>'+
      '<p>前ラウンド勝者：'+(draftWinner==='host'?'YOU':'BOT')+'｜勝者から先に選択</p>'+
      '<p class="draftScore">YOU '+game.scores.host+' — '+game.scores.guest+' BOT｜3勝先取</p>'+
      '<div class="draftGrid">'+options+'</div>'+ (yourTurn?replace:'')+
      '<p class="draftBottom">所持：'+(mine.map(id=>draftById.get(id).name).join(' / ')||'なし')+'　（最大3枚・蓄積）</p></div>';
    el.classList.remove('hidden');
  }
  let draftOfferTaken=new Set();
  function draftPick(side,id,replaceId=null){
    if(!solo||game.phase!=='round_end'||draftQueue[draftTurn]!==side||
      !draftOffer.includes(id)||draftOfferTaken.has(id)||draftOwned[side].includes(id))return false;
    if(draftOwned[side].length>=3){
      if(!draftOwned[side].includes(replaceId))return false;
      draftOwned[side]=draftOwned[side].filter(x=>x!==replaceId);
    }
    draftOwned[side].push(id);draftOfferTaken.add(id);draftTurn++;
    draftHud();
    if(draftTurn>=draftQueue.length){
      const panel=document.getElementById('draftOverlay');
      if(panel){panel.querySelector('h2').textContent='戦術決定！ 次のラウンドへ';}
      draftTimer=setTimeout(()=>{
        draftTimer=null;
        if(solo&&game.phase==='round_end'){document.getElementById('draftOverlay').classList.add('hidden');publishSoloRound(false);}
      },650);
    }else{
      draftOverlayRender();
      if(draftQueue[draftTurn]==='guest')draftAutoBotPick();
    }
    return true;
  }
  function draftAutoBotPick(){
    if(draftTimer){clearTimeout(draftTimer);draftTimer=null;}
    draftTimer=setTimeout(()=>{
      draftTimer=null;
      if(!solo||game?.phase!=='round_end'||draftQueue[draftTurn]!=='guest')return;
      const priority=['opening_guard','finisher','moving_reload','clutch_armor','hit_stride','last_shell','empty_sprint','followthrough'];
      const candidates=draftOffer.filter(id=>!draftOfferTaken.has(id)&&!draftOwned.guest.includes(id));
      candidates.sort((a,b)=>priority.indexOf(a)-priority.indexOf(b));
      draftPick('guest',candidates[0],draftOwned.guest.length>=3?draftOwned.guest[0]:null);
    },500);
  }
  function draftBegin(winner){
    if(!solo||game?.phase!=='round_end'||!['host','guest'].includes(winner))return;
    if(draftQueue.length&&document.getElementById('draftOverlay')&&!document.getElementById('draftOverlay').classList.contains('hidden'))return;
    if(draftTimer){clearTimeout(draftTimer);draftTimer=null;}
    draftWinner=winner;draftQueue=[winner,winner==='host'?'guest':'host'];draftTurn=0;
    draftOffer=draftChooseOffer(winner);draftOfferTaken=new Set();
    clearControls();
    draftOverlayRender();
    if(winner==='guest')draftAutoBotPick();
  }
  function draftPrototypeInit(){
    const el=document.createElement('div');el.id='draftOverlay';el.className='hidden';
    el.addEventListener('click',e=>{
      const button=e.target.closest('button[data-draft-id]');
      if(!button)return;
      const replace=document.getElementById('draftReplace');
      draftPick('host',button.dataset.draftId,replace?.value||null);
    });
    document.getElementById('appStage').appendChild(el);
    const hud=document.createElement('div');hud.id='draftHud';hud.className='hidden';
    document.getElementById('appStage').appendChild(hud);
    document.getElementById('soloBtn').querySelector('small').textContent='3勝先取・8枚の戦術カード・通信不要';
    document.getElementById('lobbyScreen').querySelector('h1 span').textContent='BOT TACTICAL DRAFT · 試作版';
    // This prototype cannot create or join real Firebase rooms.
    for(const id of ['createBtn','openJoinPanel','joinBtn','joinBotBtn']){const node=document.getElementById(id);if(node)node.disabled=true;}
    draftReset();
  }
  // Dev QA is intentionally isolated to this unpublished lab, not the stable site.
  window.__brawlDraftQA=()=>({solo,phase:game?.phase,round:game?.round,scores:game?.scores,
    winner:draftWinner,pick:draftQueue[draftTurn]||null,offered:[...draftOffer],
    taken:[...draftOfferTaken],owned:structuredClone(draftOwned),hp:game?.hp,
    forceKO:(winner)=>{if(!solo||!isPlaying())return false;const victim=winner==='host'?'guest':'host';
      applySoloDamage(victim,(game.hp?.[victim]||0)+200,winner,500,300,'effect');return true;}});
