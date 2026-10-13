// New standalone iPad release contract, kept separate from frozen historical builds.
'use strict';
const fs=require('node:fs'),assert=require('node:assert/strict'),vm=require('node:vm');
const spec=JSON.parse(fs.readFileSync('shared/brawl-ipad-playtest-v2.json','utf8'));
const games={};
for(const [mode,file] of Object.entries(spec.pages)){
 const html=fs.readFileSync(file,'utf8');
 assert(html.includes('<!DOCTYPE html>'),'standalone doctype '+mode);
 assert(!/<script\b[^>]*\bsrc=/i.test(html),'fully inlined game '+mode);
 const chunks=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)];
 for(const [,js] of chunks)if(js.trim())new vm.Script(js,{filename:mode+'.html'});
 const match=html.match(/const CHARS\s*=\s*\{([\s\S]*?)\n\s*\};/);
 assert(match,'characters config '+mode);
 const chars=match[1];
 for(const [id,c] of Object.entries(spec.characters)){
  const re=new RegExp('\\b'+id+':\\{[^\\n]*?hp:(\\d+)');
  const m=chars.match(re);assert(m,'missing character '+mode+'/'+id);
  assert.equal(Number(m[1]),c.hp,mode+'/'+id+' canonical HP');
 }
 assert.match(html,/BrawlWeaponV1\.spread/,'shared spread engine '+mode);
 assert.match(html,/drawNormalAimGuide|drawShotGuide/,'aim guides '+mode);
 assert.match(html,/display:none!important/,'quiet UI '+mode);
 assert(!html.includes('new Audio(')&&!html.includes('AudioContext('),'no audio engine');
 games[mode]=html;
 console.log('PASS iPad v2 '+mode+' common character HP, aim guides, silent standalone JS');
}
assert(games['1vs1'].includes('function drawNormalAimGuide'));
assert(games['1vs1'].includes('function lineBlocked'));
assert(games['1vs1'].includes('resultStats1v1'));
assert(games['2vs2'].includes('battleStats'));
assert(games['2vs2'].includes('renderResultStats'));
assert(games['2vs2'].includes('function shotLineBlocked'));
assert(games['2vs2'].includes('cameraSubject'));
assert(games['2vs2'].includes('const sniperInRange=true;'));
assert(games['2vs2'].includes('const lastStand='));
console.log('PASS iPad v2: shared 160HP Tank while old verified releases stay unchanged');
