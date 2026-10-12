// Verify actual tank candidate is a narrow gameplay diff, not an accidental full-game rewrite.
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {buildTankBalance,TANK_BALANCE}=require('../scripts/build-tank-balance-lab.cjs');
const base=fs.readFileSync('foundation/2v2-open-arena-lab.html','utf8');
const lab=fs.readFileSync('foundation/2v2-open-arena-tank-lab.html','utf8');
assert.equal(lab,buildTankBalance(base),'tank lab generated exactly');
const script=lab.match(/<script>([\s\S]*?)<\/script>/)?.[1];
assert(script&&script.length>100000);
new vm.Script(script,{filename:'2v2-open-arena-tank-lab.html'});
// The two gameplay modifications are precisely tank HP and Guardian mitigation.
const removed=lab.replace('tank:{label:"タンク",hp:160,','tank:{label:"タンク",hp:180,')
 .replace('guardian=null,guardFactor=.75','guardian=null,guardFactor=.65')
 .replace('<title>BRAWL 2vs2 | Tank Balance LAB</title>','<title>BRAWL 2vs2 | Open Arena LAB</title>')
 .replace('OPEN ARENA · TANK 160HP · GUARD 25% · COMPARE','QUIET COMBAT R4.1 · PREVIEW')
 .replace('window.__brawlV3QA=()=>({tankBalanceLab:true,openArenaLab:true','window.__brawlV3QA=()=>({openArenaLab:true')
 .replace('<!-- TANK BALANCE COMPARISON: generated from Open Arena LAB; do not edit manually. -->\\n','');
assert.equal(removed,base,'no other mechanics, navigation, maps, BOT, controls or visuals changed');
const top=script.indexOf('/* BEGIN SHARED MATCH STATE */'),end=script.indexOf('/* END SHARED MATCH STATE */',top);
assert(top>=0&&end>top,'actual compiled shared match logic present');
const env={};vm.runInNewContext(script.slice(top,end)+'\nthis.match=BrawlMatchV1;',env);
function hit(guard){
 const g={hp:{v:100},stats:{v:{char:'gunner',ult:0},t:{char:'tank',ult:0,guardSaved:0}},reveals:{}};
 const effect=env.match.applyHit(g,{victim:'v',owner:'t',amount:40},1000,{},guard?{guardian:'t'}:{});
 return {damage:effect.amount,saved:effect.saved,hp:g.hp.v};
}
assert.deepEqual(hit(true),{damage:30,saved:10,hp:70},'Guardian now blocks 25 percent, keeps hit bookkeeping');
assert.deepEqual(hit(false),{damage:40,saved:0,hp:60},'ordinary damage unchanged');
assert(lab.includes('tank:{label:"タンク",hp:160,'),'tank health reduced in actual generated CHARS');
assert(lab.includes('gunner:{label:"ガンナー",hp:100,'),'gunner health unaffected');
assert(lab.includes('guardianLinkMs:3200'),'Guardian skill duration is unchanged');
assert.equal(TANK_BALANCE.hp,160);
console.log('PASS tank HP 180 → 160; Guardian mitigation 35% → 25%; all other mechanics and map preserved');
