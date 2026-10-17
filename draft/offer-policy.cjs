// BRAWL draft-only deterministic offer planning. NOT wired to live combat/RTDB.
// Any future online integration must select/commit the seed on the authoritative host.
'use strict';
const assert=require('node:assert/strict');
const catalog=require('./card-catalog.v0.1.json');
const {draftOrder,beginDraft}=require('./strategy-core.cjs');
const manifest=require('./variant-manifest.json');
const byId=new Map(catalog.cards.map(c=>[c.id,c]));
const MATCH_MODES=new Set(['1vs1.ko','2vs2.ko','2vs2.area']);
const modeSize=m=>m.startsWith('1vs1.')?'1vs1':'2vs2';
function eligibleCards(mode){
 assert(MATCH_MODES.has(mode),'unknown supported draft mode');
 return catalog.cards.filter(c=>c.modes.includes(mode));
}
function assessOffer({mode,roster,winner,draftIndex=0,owned={},offered}){
 const size=modeSize(mode),order=draftOrder({roster,winner,draftIndex});
 assert(order.length===(size==='1vs1'?2:4),'roster and game mode disagree');
 const expected=manifest.draftDefaults.offerSize[size];
 assert(Array.isArray(offered)&&offered.length===expected,'unexpected offered-card count');
 assert(new Set(offered).size===offered.length,'duplicate offers');
 const pool=eligibleCards(mode),eligible=new Set(pool.map(c=>c.id));
 assert(offered.every(id=>eligible.has(id)),'offered card is not eligible for match mode');
 // A real draft at 3-card cap must never lock out a late picker, regardless
 // of which of the shared cards earlier players choose.
 const categories=new Set(offered.map(id=>byId.get(id).family));
 const issues=[];
 if(categories.size<3)issues.push('too few distinct card families');
 for(let i=0;i<order.length;i++){
  const seat=order[i],cards=owned[seat]||[];
  assert(Array.isArray(cards)&&cards.length<=manifest.draftDefaults.maxOwnedCards&&
   new Set(cards).size===cards.length&&cards.every(id=>byId.has(id)&&eligible.has(id)),
   'invalid draft inventory for '+seat);
  const available=offered.filter(id=>!cards.includes(id)).length;
  const needed=order.length-i;
  if(available<needed)issues.push(seat+' may be left without a new card at pick '+(i+1));
 }
 return {safe:issues.length===0,issues,categories:categories.size,order};
}
function shuffle(input,seed){
 const a=input.slice();
 let state=(seed>>>0)||0x6d2b79f5;
 function next(){state^=state<<13;state^=state>>>17;state^=state<<5;return state>>>0;}
 for(let i=a.length-1;i>0;i--){const j=next()%(i+1);[a[i],a[j]]=[a[j],a[i]];}
 return a;
}
function proposeOffer({mode,roster,winner,draftIndex=0,owned={},seed}){
 assert(Number.isSafeInteger(seed)&&seed>=0&&seed<=0xffffffff,'integer server-picked seed required');
 const size=modeSize(mode),count=manifest.draftDefaults.offerSize[size];
 const ids=eligibleCards(mode).map(c=>c.id);
 // Deterministic, bounded candidate search. It is not RNG security, a server
 // selection protocol or a promise that both teams have equal expected power.
 for(let i=0;i<1024;i++){
  const offered=shuffle(ids,(seed+Math.imul(i+1,0x9e3779b9))>>>0).slice(0,count);
  const result=assessOffer({mode,roster,winner,draftIndex,owned,offered});
  if(result.safe){
   // Hand to the existing immutable draft reducer, without granting effects.
   beginDraft({roster,winner,draftIndex,offered,owned,maxOwnedCards:manifest.draftDefaults.maxOwnedCards});
   return offered;
  }
 }
 throw Error('No safe draft offer can be constructed from the current card pool');
}
module.exports={catalog,eligibleCards,assessOffer,proposeOffer};
