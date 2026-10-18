// Pure adaptive BOT draft ranking tests. No DOM/Firebase/Playwright needed.
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../draft/duel-bot-prototype.inc.js'),'utf8');
const match=source.match(/\/\/ BOT DRAFT POLICY START([\s\S]*?)\/\/ BOT DRAFT POLICY END/);
assert(match,'policy must be extractable from the actual HTML inline source');
const {draftBotWeights,draftBotLoadoutScore,draftBotBestPick}=vm.runInNewContext(
  match[1]+'\n({draftBotWeights,draftBotLoadoutScore,draftBotBestPick})',
  {},{timeout:1000}
);
const ids=Object.keys(draftBotWeights);
assert.equal(ids.length,8,'only the 8 genuinely playable cards may be drafted');
const base={
  offered:['empty_sprint','opening_guard','clutch_armor','finisher'],
  taken:[],owned:[],enemyOwned:[],hero:'gunner',enemyHero:'gunner'
};
function pick(extra={}){
  const input={...base,...extra};
  const snapshot=JSON.stringify(input);
  const p=draftBotBestPick(input);
  assert.equal(JSON.stringify(input),snapshot,'policy must not modify match state');
  if(p){
    assert(input.offered.includes(p.id),'offered card required');
    assert(!input.taken.includes(p.id),'already claimed card must stay unavailable');
    assert(!input.owned.includes(p.id),'do not re-pick a held card');
    if(input.owned.length>=3)assert(input.owned.includes(p.replaceId),'valid replacement required at cap');
    else assert.equal(p.replaceId,null,'no forced replacement below three cards');
    assert(Number.isFinite(p.value),'decision must have finite heuristic');
  }
  return p;
}
assert.equal(pick({owned:['last_shell']}).id,'empty_sprint');
assert.equal(pick({
  owned:[],enemyOwned:['finisher'],hero:'tank',
  offered:['clutch_armor','opening_guard','moving_reload','hit_stride']
}).id,'clutch_armor');
assert.equal(pick({
  owned:[],hero:'sniper',enemyHero:'sniper',
  offered:['opening_guard','finisher','moving_reload','hit_stride']
}).id,'opening_guard');
const replacement=pick({
  owned:['last_shell','empty_sprint','clutch_armor'],
  offered:['moving_reload','followthrough','hit_stride','opening_guard']
});
assert.equal(replacement.id,'opening_guard');
assert.equal(replacement.replaceId,'clutch_armor');
assert.equal(
  draftBotLoadoutScore(['moving_reload','last_shell'],'gunner','gunner',[]),
  57+56-6,'overlapping reload enhancement is discounted'
);
assert.equal(
  draftBotLoadoutScore(['clutch_armor'],'tank','gunner',['finisher'])-
  draftBotLoadoutScore(['clutch_armor'],'tank','gunner',[]),
  12,'known opponent finisher raises counter-defense value'
);
assert.equal(pick({offered:['last_shell'],taken:['last_shell']}),null);
assert.equal(pick({offered:['last_shell'],owned:['last_shell']}),null);
let cases=0;
for(let seed=0;seed<2048;seed++){
  const own=ids.filter((_,i)=>!!(seed&(1<<i))).slice(0,3);
  const enemy=ids.filter((_,i)=>!!(((seed*29+7)&255)&(1<<i))).slice(0,3);
  const offered=Array.from({length:4},(_,i)=>ids[(seed+i*3)%ids.length]);
  const unique=[...new Set(offered)];
  const taken=seed%3===0?[unique[seed%unique.length]]:[];
  const chosen=pick({owned:own,enemyOwned:enemy,offered:unique,taken,
    hero:['tank','gunner','bomber','sniper'][seed%4],
    enemyHero:['sniper','tank','gunner','bomber'][(seed>>2)%4]});
  const options=unique.filter(id=>!taken.includes(id)&&!own.includes(id));
  assert.equal(Boolean(chosen),options.length>0,'BOT must act iff legal offer exists');
  if(chosen){
    const result=chosen.replaceId?own.filter(x=>x!==chosen.replaceId).concat(chosen.id):
      own.concat(chosen.id);
    assert(result.length<=3,'inventory cap remains enforced');
    assert.equal(new Set(result).size,result.length,'no duplicates');
  }
  cases++;
}
console.log('PASS adaptive BOT draft: synergy, visible counterpicks, character roles, replacement, '+cases+' inventory cases');
