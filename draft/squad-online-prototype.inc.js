// Tactical Draft ONLINE squad 2vs2. Pure reducer; no Firebase, DOM or credentials.
// RTDB may omit empty arrays and objects. Seat identity must be enforced by actual Rules/Auth before public release.
  const SQUAD_DRAFT_CARDS=[
    {id:'empty_sprint',name:'空弾疾走',family:'mobility',desc:'残弾0で移動速度+9%'},
    {id:'opening_guard',name:'先制防壁',family:'defense',desc:'6秒無被弾なら次の通常射撃を7軽減'},
    {id:'finisher',name:'仕留めの一押し',family:'pressure',desc:'HP35%以下の敵に通常射撃+5（8秒）'},
    {id:'moving_reload',name:'走行装填',family:'reload',desc:'0.8秒連続移動中、装填+12%'},
    {id:'hit_stride',name:'追撃歩法',family:'mobility',desc:'通常攻撃命中後1.8秒、移動+7%'},
    {id:'clutch_armor',name:'崖際装甲',family:'defense',desc:'HP35%以下で通常射撃-8%'},
    {id:'last_shell',name:'最後の装填',family:'reload',desc:'残弾0で装填+16%'},
    {id:'followthrough',name:'連続圧力',family:'pressure',desc:'同一敵に2.5秒以内に再命中で+3（8秒）'},
    {id:'recoil_shot',name:'反動射撃',family:'shot_mod',desc:'通常射撃威力+10%／反動で60後退（1.2秒CD）'},
    {id:'delayed_blast',name:'遅延爆発',family:'shot_mod',desc:'通常射撃の最初の命中から0.7秒後に10ダメージの小爆発（3秒CD）'},
    {id:'split_round',name:'分裂弾',family:'shot_mod',desc:'中心弾が射程半分で2分裂・子弾威力60%'},
    {id:'ricochet',name:'跳弾',family:'shot_mod',desc:'通常弾が壁に当たると最大1回反射・反射後は威力70%'},
    {id:'trap_mine',name:'トラップマイン',family:'gadget2',desc:'GAD2: 9秒間の接近感知地雷。1回だけ8ダメージ＋1.4秒鈍足'},
    {id:'smoke',name:'スモーク',family:'gadget2',desc:'GAD2: 4秒・半径100の煙幕。ブッシュ隠密、攻撃で700ms露出'},
    {id:'warp_beacon',name:'ワープビーコン',family:'gadget2',desc:'GAD2: 7秒内に2度押しで安全な位置へ瞬間帰還、CD15秒'},
    {id:'portable_wall',name:'ポータブルウォール',family:'gadget2',desc:'GAD2: 42×112の固い遮蔽物を4秒設置。12秒クールダウン'},
    {id:'hologram',name:'ホログラム',family:'gadget2',desc:'GAD2: 7秒自律囮・無害な見せ弾・敵の1射撃で消滅（14秒CD）'}
  ];
  const squadCardMap=new Map(SQUAD_DRAFT_CARDS.map(c=>[c.id,c]));

const SQUAD_SEATS=['blue1','blue2','red1','red2'];
const squadTeam=seat=>seat.startsWith('blue')?'blue':'red';
function squadNewMatch(){
  return {owned:Object.fromEntries(SQUAD_SEATS.map(s=>[s,[]])),cooldown:{},
    lastDamage:{},lastNormal:{},strideUntil:{},blastCooldown:{},blastUsed:{},complete:false};
}
function squadHand(d,seat){return Array.isArray(d?.owned?.[seat])?d.owned[seat]:[];}
function squadOrder(winner,index){
  if(!['blue','red'].includes(winner)||!Number.isInteger(index)||index<0)throw Error('winner/index');
  const lose=winner==='blue'?'red':'blue',i=index%2;
  return [winner+(i+1),lose+(i+1),lose+(2-i),winner+(2-i)];
}
function squadOffer(owned,roomId,round,order){
  // Prefer 6 choices, but with just eight prototype cards, safely expand up to 8
  // when accumulated hands could leave any late picker with no legal card.
  const cards=SQUAD_DRAFT_CARDS.map(c=>c.id),families=Object.fromEntries(SQUAD_DRAFT_CARDS.map(c=>[c.id,c.family]));
  const seed=String(roomId)+':'+String(round);
  let h=2166136261;for(const ch of seed)h=Math.imul(h^ch.charCodeAt(0),16777619)>>>0;
  function safe(offer){
    function explore(t,taken){
      if(t>=order.length)return true;
      const options=offer.filter(id=>!taken.includes(id)&&!squadHand({owned},order[t]).includes(id));
      return options.length>0&&options.every(id=>explore(t+1,[...taken,id]));
    }
    return explore(0,[]);
  }
  for(let size=6;size<=cards.length;size++){
    const offers=[];
    const choose=(start,a)=>{
      if(a.length===size){
        if(new Set(a.map(id=>families[id])).size>=3&&safe(a))offers.push([...a]);
        return;
      }
      for(let i=start;i<=cards.length-(size-a.length);i++)choose(i+1,[...a,cards[i]]);
    };
    choose(0,[]);
    if(offers.length)return offers[h%offers.length];
  }
  throw Error('No safe four-seat draft offer');
}
function squadBegin(g,roomId){
  if(g?.phase!=='round_end'||g.mode!=='ko'||!['blue','red'].includes(g.winner)||
     g.scores?.blue>=3||g.scores?.red>=3||g.draft?.forRound===g.round)return null;
  const previous=g.draft||squadNewMatch(),order=squadOrder(g.winner,(g.round||1)-1),
    owned=Object.fromEntries(SQUAD_SEATS.map(k=>[k,[...squadHand(previous,k)]]));
  const offered=squadOffer(owned,roomId,g.round,order);
  return {...g,phase:'draft',draft:{...previous,owned,order,offered,taken:[],
    turn:0,winner:g.winner,forRound:g.round,complete:false}};
}
function squadPick(g,actorSeat,id,replaceId=null){
  const d=g?.draft;
  if(g?.phase!=='draft'||!SQUAD_SEATS.includes(actorSeat)||d?.order?.[d.turn]!==actorSeat||
    !squadCardMap.has(id)||!d.offered?.includes(id)||(d.taken||[]).includes(id)||
    squadHand(d,actorSeat).includes(id))return null;
  const old=squadHand(d,actorSeat),owned=Object.fromEntries(SQUAD_SEATS.map(s=>[s,[...squadHand(d,s)]]));
  if(old.length>=3){if(!old.includes(replaceId))return null;owned[actorSeat]=old.filter(c=>c!==replaceId);}
  else if(replaceId!==null)return null;
  owned[actorSeat].push(id);
  const turn=d.turn+1,complete=turn===4;
  return {...g,phase:complete?'round_end':'draft',draft:{...d,owned,taken:[...(d.taken||[]),id],turn,complete}};
}
function squadBlastAuthorize(d,seat,fireActionId,t){
  if(!d||!SQUAD_SEATS.includes(seat)||typeof fireActionId!=='string'||
     fireActionId.length<1||fireActionId.length>128||!Number.isFinite(t)||
     !squadHand(d,seat).includes('delayed_blast'))return false;
  d.blastUsed ||= {};d.blastCooldown ||= {};
  if(d.blastUsed[fireActionId]||(d.blastCooldown[seat]||0)>t)return false;
  d.blastUsed[fireActionId]=1;d.blastCooldown[seat]=t+3000;
  // Even unusually long matches must not grow this RTDB map without bound.
  const keys=Object.keys(d.blastUsed);
  if(keys.length>80)for(const key of keys.slice(0,keys.length-80))delete d.blastUsed[key];
  return true;
}
// GAD2 is a separate slot. When several are owned, the latest acquired is equipped.
const SQUAD_GAD2_IDS=['trap_mine','smoke','warp_beacon','portable_wall','hologram']; // all five 2v2 GAD2 supported.
function squadGad2Equipped(d,seat){
 const owned=squadHand(d,seat);
 return [...owned].reverse().find(id=>SQUAD_GAD2_IDS.includes(id))||null;
}
function squadNextRound(d){
  const last=d||squadNewMatch();
  return {...last,owned:Object.fromEntries(SQUAD_SEATS.map(s=>[s,[...squadHand(last,s)]])),
    complete:false,turn:0,order:[],offered:[],taken:[],
    lastDamage:{},lastNormal:{},strideUntil:{},cooldown:{},blastCooldown:{},blastUsed:{},gadget2ReadyAt:{}};
}
function squadDamage(g,h,t){
  if(!g.draft)return h;
  const d=g.draft,victimSeat=SQUAD_SEATS.find(k=>g.seats?.[k]?.id===h.victim),
    ownerSeat=SQUAD_SEATS.find(k=>g.seats?.[k]?.id===h.owner);
  if(!victimSeat)return h;
  d.lastDamage ||= {};d.lastNormal ||= {};d.cooldown ||= {};d.strideUntil ||= {};
  const before=d.lastDamage[victimSeat]||0;
  d.lastDamage[victimSeat]=t;
  if(h.kind!=='normal'||!ownerSeat)return h;
  const has=(seat,id)=>squadHand(d,seat).includes(id);
  const cd=(seat,id)=>d.cooldown[seat]?.[id]||0;
  const setCd=(seat,id,v)=>{d.cooldown[seat] ||= {};d.cooldown[seat][id]=v;};
  const st=g.stats[h.victim],max={tank:160,gunner:100,sniper:70,bomber:90}[st.char]||100;
  const low=g.hp[h.victim]/max<=.35;
  let plus=0;
  if(has(ownerSeat,'finisher')&&low&&cd(ownerSeat,'finisher')<=t){
    plus+=5;setCd(ownerSeat,'finisher',t+8000);
  }
  const prev=d.lastNormal[ownerSeat];
  if(has(ownerSeat,'followthrough')&&prev?.victim===h.victim&&t-prev.at<=2500&&t>prev.at&&(!h.fireId||prev.fireId!==h.fireId)&&cd(ownerSeat,'followthrough')<=t){
    plus+=3;setCd(ownerSeat,'followthrough',t+8000);
  }
  let amount=(h.amount+Math.min(7,plus))*(has(ownerSeat,'recoil_shot')?1.10:1);
  if(has(victimSeat,'clutch_armor')&&low)amount*=.92;
  if(has(victimSeat,'opening_guard')&&t-before>=6000&&cd(victimSeat,'opening_guard')<=t){
    amount-=7;setCd(victimSeat,'opening_guard',t+14000);
  }
  amount=Math.max(0,Math.round(amount));
  if(amount>0){
    d.lastNormal[ownerSeat]={at:t,victim:h.victim,fireId:h.fireId||null};
    if(has(ownerSeat,'hit_stride')&&cd(ownerSeat,'hit_stride')<=t){
      d.strideUntil[ownerSeat]=t+1800;setCd(ownerSeat,'hit_stride',t+6000);
    }
  }
  return {...h,amount};
}
function squadMoveFactor(d,seat,ammo,t){
  const hand=squadHand(d,seat);
  const bonus=(hand.includes('empty_sprint')&&ammo===0?9:0)+(hand.includes('hit_stride')&&(d?.strideUntil?.[seat]||0)>t?7:0);
  return 1+Math.min(12,bonus)/100;
}
function squadReloadFactor(d,seat,ammo,t,motionSince){
  const hand=squadHand(d,seat);
  const bonus=(hand.includes('last_shell')&&ammo===0?16:0)+
    (hand.includes('moving_reload')&&motionSince>0&&t-motionSince>=800?12:0);
  return 1+Math.min(20,bonus)/100;
}
