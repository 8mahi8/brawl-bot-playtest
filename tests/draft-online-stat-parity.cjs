// Guard the draft-only combat simulator from diverging from ONLINE live lab specs.
// Normal-release HTML remains frozen and is checked by the release freeze test.
'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const profile=require('../draft/online-stat-profile.json');
function read(p){return fs.readFileSync(path.join(root,p),'utf8');}
for(const mode of ['1vs1','2vs2']){
 const input=read(profile.sources[mode]);
 const charBlock=/const CHARS=\{([\s\S]*?)\n \};/.exec(input);
 const balanceBlock=/const BALANCE=\{([\s\S]*?)\n \};/.exec(input);
 assert(charBlock&&balanceBlock,'current online game contract must be parseable: '+mode);
 function value(obj,name){
  const found=new RegExp('(?:^|\\n)\\s*'+name+':([^,\\n]+)').exec(obj);
  assert(found,'missing balance '+name);
  return Number(found[1]);
 }
 for(const [char,expected] of Object.entries(profile.characters[mode])){
  const row=new RegExp('(?:^|\\n)\\s*'+char+':\\{([^\\n}]+)\\}').exec(charBlock[1]);
  assert(row,'missing character '+char+' in '+mode);
  function field(name){
   const found=new RegExp('(?:^|,)'+name+':([^,}]+)').exec(row[1]);
   assert(found,'missing field '+name+' '+char);
   return found[1].trim();
  }
  const hp=Number(field('hp'));
  const directDamage=field('damage');
  const dmg=directDamage.startsWith('BALANCE.')?value(balanceBlock[1],directDamage.slice(8)):Number(directDamage);
  const reload=Number(field('reload'))*(mode==='1vs1'?1000:1);
  assert.equal(hp,expected.hp,'online '+mode+' '+char+' HP drifted: update proposed draft profile before testing');
  assert.equal(dmg,expected.baseDamage,'online '+mode+' '+char+' base hit damage drifted');
  assert(Math.abs(reload-expected.reloadMs)<.001,'online '+mode+' '+char+' reload drifted');
 }
 assert.equal(profile.characters[mode].tank.hp,160,'current online Tank must be 160HP, not old foundation 180HP');
 console.log('PASS draft prototype uses current online '+mode+' HP/base damage/reload, including Tank160');
}
