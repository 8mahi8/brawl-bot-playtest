// BRAWL Tactical Draft 1vs1: state reducer for a LOCAL-emulator-only online lab.
// Host begins draft; each player submits an atomic transaction for their own turn.
// Caller/RTDB Rules must authenticate seats before actual public use.
  const NET_DRAFT_CARDS=[
    {id:'empty_sprint',name:'空弾疾走',family:'mobility',desc:'残弾0で移動速度+9%'},
    {id:'opening_guard',name:'先制防壁',family:'defense',desc:'6秒無被弾なら次の通常射撃を7軽減'},
    {id:'finisher',name:'仕留めの一押し',family:'pressure',desc:'HP35%以下の敵に通常射撃+5（8秒）'},
    {id:'moving_reload',name:'走行装填',family:'reload',desc:'0.8秒連続移動中、装填+12%'},
    {id:'hit_stride',name:'追撃歩法',family:'mobility',desc:'通常攻撃命中後1.8秒、移動+7%'},
    {id:'clutch_armor',name:'崖際装甲',family:'defense',desc:'HP35%以下で通常射撃-8%'},
    {id:'last_shell',name:'最後の装填',family:'reload',desc:'残弾0で装填+16%'},
    {id:'followthrough',name:'連続圧力',family:'pressure',desc:'同一敵に2.5秒以内に再命中で+3（8秒）'}
  ];
  const netDraftCardMap=new Map(NET_DRAFT_CARDS.map(c=>[c.id,c]));
  function netDraftNewMatch(){
    return {owned:{host:[],guest:[]},cooldown:{host:{},guest:{}},
      lastDamage:{host:0,guest:0},lastNormal:{host:-1,guest:-1},
      hitStrideUntil:{host:0,guest:0},complete:false};
  }
  function netDraftOffer(owned,room,round){
    const valid=[];
    const cards=NET_DRAFT_CARDS;
    for(let a=0;a<cards.length;a++)for(let b=a+1;b<cards.length;b++)
    for(let c=b+1;c<cards.length;c++)for(let d=c+1;d<cards.length;d++){
      const offer=[cards[a],cards[b],cards[c],cards[d]];
      if(new Set(offer.map(x=>x.family)).size<3)continue;
      if(offer.filter(x=>!owned.host.includes(x.id)).length<2)continue;
      if(offer.filter(x=>!owned.guest.includes(x.id)).length<2)continue;
      valid.push(offer.map(x=>x.id));
    }
    if(!valid.length)throw Error('No legal two-seat online draft offers');
    let hash=0;
    for(const ch of String(room)+':'+String(round))hash=(Math.imul(hash,33)+ch.charCodeAt(0))>>>0;
    return valid[hash%valid.length];
  }
  function netDraftBegin(g,room){
    if(!g||g.phase!=='round_end'||g.loser==='draw'||
       !['host','guest'].includes(g.loser)||g.scores?.host>=3||g.scores?.guest>=3)return null;
    if(g.draft?.forRound===g.round)return null;
    const winner=g.loser==='host'?'guest':'host',loser=g.loser;
    const prior=g.draft||netDraftNewMatch();
    const owned={host:[...(prior.owned?.host||[])],guest:[...(prior.owned?.guest||[])]};
    const offered=netDraftOffer(owned,room,g.round);
    return {...g,phase:'draft',draft:{...prior,owned,offered,taken:[],
      order:[winner,loser],winner,turn:0,forRound:g.round,complete:false}};
  }
  function netDraftPick(g,side,id,replaceId=null){
    const d=g?.draft;
    if(g?.phase!=='draft'||!d||!['host','guest'].includes(side)||
       d.order?.[d.turn]!==side||d.complete||!d.offered?.includes(id)||
       d.taken?.includes(id)||d.owned?.[side]?.includes(id)||!netDraftCardMap.has(id))return null;
    const owned={host:[...(d.owned?.host||[])],guest:[...(d.owned?.guest||[])]};
    if(owned[side].length>=3){
      if(!owned[side].includes(replaceId))return null;
      owned[side]=owned[side].filter(x=>x!==replaceId);
    }else if(replaceId!==null)return null;
    owned[side].push(id);
    const turn=d.turn+1,complete=turn===d.order.length;
    return {...g,phase:complete?'round_end':'draft',
      draft:{...d,owned,taken:[...d.taken,id],turn,complete}};
  }
  function netDraftNextRound(d,startAt){
    const old=d||netDraftNewMatch();
    return {...old,offered:[],taken:[],order:[],winner:null,turn:0,complete:false,
      lastDamage:{host:startAt,guest:startAt},lastNormal:{host:-1,guest:-1},
      hitStrideUntil:{host:0,guest:0}};
  }
  function netDraftHit(d,chars,hp,victim,amount,owner,kind,now){
    const updated=structuredClone(d||netDraftNewMatch());
    // RTDB omits empty arrays/objects: always normalize empty inventories and cooldown maps.
    updated.owned={host:[...(updated.owned?.host||[])],guest:[...(updated.owned?.guest||[])]};
    updated.cooldown={host:{...(updated.cooldown?.host||{})},guest:{...(updated.cooldown?.guest||{})}};
    updated.lastNormal={host:updated.lastNormal?.host??-1,guest:updated.lastNormal?.guest??-1};
    updated.lastDamage={host:updated.lastDamage?.host||0,guest:updated.lastDamage?.guest||0};
    updated.hitStrideUntil={host:updated.hitStrideUntil?.host||0,guest:updated.hitStrideUntil?.guest||0};
    const has=(side,id)=>updated.owned?.[side]?.includes(id);
    const ready=(side,id)=>(updated.cooldown?.[side]?.[id]||0)<=now;
    if(kind!=='normal'||!['host','guest'].includes(owner)){
      updated.lastDamage[victim]=now;
      return {amount,draft:updated};
    }
    const attacker=owner,pre=hp[victim],max=chars[victim]==='tank'?160:
      chars[victim]==='gunner'?100:chars[victim]==='sniper'?70:90;
    let bonus=0;
    if(has(attacker,'finisher')&&pre/max<=.35&&ready(attacker,'finisher')){
      bonus+=5;updated.cooldown[attacker].finisher=now+8000;
    }
    if(has(attacker,'followthrough')&&updated.lastNormal[attacker]>=0&&
      now>updated.lastNormal[attacker]&&now-updated.lastNormal[attacker]<=2500&&ready(attacker,'followthrough')){
      bonus+=3;updated.cooldown[attacker].followthrough=now+8000;
    }
    const raw=amount+Math.min(7,bonus);
    const pct=has(victim,'clutch_armor')&&pre/max<=.35?8:0;
    let flat=0;
    if(has(victim,'opening_guard')&&now-updated.lastDamage[victim]>=6000&&ready(victim,'opening_guard')){
      flat=7;updated.cooldown[victim].opening_guard=now+14000;
    }
    const result=Math.max(0,Math.round(raw*(1-pct/100)-flat));
    updated.lastDamage[victim]=now;
    if(result>0){
      updated.lastNormal[attacker]=now;
      if(has(attacker,'hit_stride')&&ready(attacker,'hit_stride')){
        updated.hitStrideUntil[attacker]=now+1800;
        updated.cooldown[attacker].hit_stride=now+6000;
      }
    }
    return {amount:result,draft:updated};
  }
  function netDraftMotion(oldX,oldY,newX,newY,dt,speed,active){
    return !!active&&Number.isFinite(dt)&&dt>0&&Number.isFinite(speed)&&speed>0&&
      Math.hypot(newX-oldX,newY-oldY)>=Math.max(.08,speed*dt*.12);
  }
