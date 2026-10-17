// BRAWL Tactical Draft: isolated, deterministic selection planning for 1vs1/2vs2.
// Pure data only. Does NOT connect to Firebase, alter combat or grant card effects.
'use strict';
const assert=require('node:assert/strict');
const ROSTERS=Object.freeze({
 '1vs1':Object.freeze({host:'host',guest:'guest'}),
 '2vs2':Object.freeze({blue1:'blue',blue2:'blue',red1:'red',red2:'red'})
});
function rosterFor(size){
 assert(ROSTERS[size], 'unknown match size');
 return {...ROSTERS[size]};
}
function teamsIn(roster){
 assert(roster&&typeof roster==='object'&&!Array.isArray(roster),'invalid roster');
 const keys=Object.keys(roster),teams=[...new Set(Object.values(roster))];
 assert((keys.length===2||keys.length===4)&&teams.length===2,'requires a full 1vs1/2vs2 roster');
 for(const team of teams)assert(keys.filter(k=>roster[k]===team).length===keys.length/2,'equal size teams');
 return teams;
}
function draftOrder({roster,winner,draftIndex=0}){
 const teams=teamsIn(roster);
 assert(teams.includes(winner),'winner must match a roster team (ties do not draft)');
 assert(Number.isSafeInteger(draftIndex)&&draftIndex>=0,'draftIndex must be a non-negative integer');
 const loser=teams.find(t=>t!==winner);
 const winners=Object.keys(roster).filter(k=>roster[k]===winner);
 const losers=Object.keys(roster).filter(k=>roster[k]===loser);
 if(winners.length===1)return [winners[0],losers[0]];
 // Winner opens AND closes. Losers receive the middle two consecutive picks.
 // Alternate first/last teammate each round so a permanent seat isn't privileged.
 const n=draftIndex%2;
 return [winners[n],losers[n],losers[1-n],winners[1-n]];
}
function beginDraft({roster,winner,draftIndex,offered,owned={},maxOwnedCards=3}){
 const order=draftOrder({roster,winner,draftIndex});
 assert(Array.isArray(offered)&&offered.length>=order.length,'need one available card per seat');
 assert(offered.every(x=>typeof x==='string'&&x.length>0),'card IDs must be nonempty strings');
 assert(new Set(offered).size===offered.length,'cannot offer duplicate card IDs');
 assert(Number.isSafeInteger(maxOwnedCards)&&maxOwnedCards>=1,'maxOwnedCards must be positive');
 const normalized={};
 for(const seat of Object.keys(roster)){
  const cards=owned[seat]||[];
  assert(Array.isArray(cards)&&cards.every(x=>typeof x==='string'&&x.length>0),'invalid saved card IDs');
  assert(new Set(cards).size===cards.length&&cards.length<=maxOwnedCards,'invalid card inventory');
  normalized[seat]=[...cards];
 }
 // Require externally selected offers. Later the server-authoritative integration
 // owns RNG, availability, rerolls and timeout/autopick; clients never choose pool.
 return {phase:'draft',winner,draftIndex,order,turn:0,offered:[...offered],
  taken:[],owned:normalized,maxOwnedCards};
}
function selectCard(draft,{seat,cardId,replaceId=null}){
 assert(draft?.phase==='draft','cannot pick outside draft');
 assert(seat===draft.order[draft.turn],'only current player may pick');
 assert(draft.offered.includes(cardId)&&!draft.taken.includes(cardId),'card not available');
 const inventory=draft.owned[seat]||[];
 assert(!inventory.includes(cardId),'player cannot stack duplicate card');
 if(inventory.length===draft.maxOwnedCards){
  assert(replaceId!==null&&inventory.includes(replaceId),'must replace one owned card at cap');
 }else assert(replaceId===null,'replacement only allowed at inventory cap');
 const next={
  ...draft,turn:draft.turn+1,taken:[...draft.taken,cardId],
  owned:{...draft.owned,[seat]:replaceId===null?[...inventory,cardId]:
    [...inventory.filter(id=>id!==replaceId),cardId]}
 };
 if(next.turn===draft.order.length)next.phase='complete';
 return next;
}
module.exports={ROSTERS,rosterFor,draftOrder,beginDraft,selectCard};
