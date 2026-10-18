// Guard accepted card-design intent. This intentionally does not inject cards into runtime pools.
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const registry=JSON.parse(fs.readFileSync(path.join(root,'draft/style-changing-cards.v1.json'),'utf8'));
assert.equal(registry.status,'approved_for_prototype_not_implemented');
assert.equal(registry.cards.length,9);
assert.equal(registry.newCardCount,9);
const ids=registry.cards.map(c=>c.id);
assert.equal(new Set(ids).size,9);
assert(!ids.includes('tracking_marker'),'weak tracking-marker card must stay excluded');
assert(registry.rejected.some(x=>x.id==='tracking_marker'));
assert.equal(registry.cards.filter(c=>c.type==='gadget2').length,5,'GAD2 candidates must share one on-screen slot');
const find=id=>registry.cards.find(x=>x.id===id);
assert.equal(find('recoil_shot').initialNumbers.normalFireDamageMultiplier,1.10);
assert.equal(find('recoil_shot').initialNumbers.recoilDistanceWorld,60);
assert(find('recoil_shot').initialNumbers.recoilCooldownMs>=1000);
assert.equal(find('split_round').initialNumbers.children,2);
assert.equal(find('split_round').initialNumbers.splitsPerFireAction,1);
assert.equal(find('split_round').initialNumbers.childDamageRatio,0.6);
assert.equal(find('split_round').initialNumbers.maxSameTargetDamageRatioFromSplit,1.2);
assert.equal(find('split_round').initialNumbers.bomberMiniBlastDamageRatio,0.5);
assert.equal(find('hologram').initialNumbers.durationMs,7000);
assert.equal(find('hologram').initialNumbers.cooldownMs,14000);
assert.equal(find('hologram').initialNumbers.healthAttackActions,1);
assert(find('hologram').safeguards.some(x=>x.includes('Hot Zone')));
assert.equal(find('delayed_blast').initialNumbers.blastPerFireAction,1);
assert.equal(find('delayed_blast').initialNumbers.delayMs,700);
assert(find('delayed_blast').safeguards.some(x=>x.includes('Tank5')));
assert(find('delayed_blast').safeguards.some(x=>x.includes('Gunner3')));
assert(registry.constraints.sameVolley.includes('fireActionId'));
assert.equal(registry.constraints.noChangeToNormalMode,true);
assert.equal(registry.constraints.showPrototypeCardsOnlyAfterEffectsImplemented,true);
assert.equal(registry.constraints.inventoryLimit,3);
const online1=fs.readFileSync(path.join(root,'draft/duel-online-prototype.inc.js'),'utf8');
const online2=fs.readFileSync(path.join(root,'draft/squad-online-prototype.inc.js'),'utf8');
const duelLab=fs.readFileSync(path.join(root,'online/draft-duel-online-lab.html'),'utf8');
const squadLab=fs.readFileSync(path.join(root,'online/draft-squad-online-lab.html'),'utf8');
for(const item of registry.cards) {
 if(item.id==='recoil_shot'){
  assert(online1.includes("id:'recoil_shot'")&&online2.includes("id:'recoil_shot'"),
   'approved first-wave recoil card must be offered in BOTH isolated online draft labs');
  assert(duelLab.includes('netRecoilFire(aim)')&&duelLab.includes('netRecoilUntil=now+1200'),
   '1vs1 must implement recoil physical effect before offering');
  assert(squadLab.includes('s.draftRecoilUntil=t+1200')&&
   squadLab.includes('motion(g,a.owner,{...delta,a:a.angle})'),
   '2vs2 host must validate recoil in canonical authoritative state before offering');
  assert(duelLab.includes("damage*=1.10"),'1vs1 Bomber must receive normal shot buff');
 }else if(item.id==='split_round'){
  assert(online1.includes("id:'split_round'")&&online2.includes("id:'split_round'"));
  assert(duelLab.includes("splitCenter:false")&&duelLab.includes("damageScale:(b.damageScale||1)*.6")&&duelLab.includes("damage*.5"));
  assert(squadLab.includes("draftAdvance(b,activeMs/1000")&&squadLab.includes("splitCenter:false")&&squadLab.includes("half?.5:1"));
 }else if(item.id==='delayed_blast'){
  assert(online1.includes("id:'delayed_blast'")&&online2.includes("id:'delayed_blast'"));
  assert(duelLab.includes("netDraftScheduleBlast(")&&duelLab.includes("processDraftBlasts()"));
  assert(squadLab.includes("scheduleDraftBlast(")&&squadLab.includes("t+3000"));
 }else{
  assert(!online1.includes("id:'"+item.id+"'"),'unimplemented online 1vs1 effect must remain gated: '+item.id);
  assert(!online2.includes("id:'"+item.id+"'"),'unimplemented online 2vs2 effect must remain gated: '+item.id);
 }
}
console.log('PASS only recoil, split and delayed blast enter BOTH emulator-only online labs; ricochet and GAD2 remain gated');
