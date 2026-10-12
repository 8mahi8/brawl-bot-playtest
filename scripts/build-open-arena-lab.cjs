// BRAWL 2vs2 wide-arenas candidate. NEVER overwrites either foundation baseline.
// Usage: node scripts/build-open-arena-lab.cjs --write | --check
'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const ROOT=path.resolve(__dirname,'..');
const BASE=path.join(ROOT,'foundation/2v2-foundation-v1.html');
const OUTPUT=path.join(ROOT,'foundation/2v2-open-arena-lab.html');

const OPEN_ARENA={"width":1920,"height":1120,"followW":1330,"followH":790,"spawn":{"blue1":{"x":480,"y":420,"a":0},"blue2":{"x":480,"y":700,"a":0},"red1":{"x":1440,"y":420,"a":3.141592653589793},"red2":{"x":1440,"y":700,"a":3.141592653589793}},"koWalls":[{"x":650,"y":230,"w":105,"h":135},{"x":1165,"y":230,"w":105,"h":135},{"x":650,"y":755,"w":105,"h":135},{"x":1165,"y":755,"w":105,"h":135},{"x":815,"y":350,"w":90,"h":115},{"x":1015,"y":350,"w":90,"h":115},{"x":815,"y":655,"w":90,"h":115},{"x":1015,"y":655,"w":90,"h":115},{"x":910,"y":125,"w":100,"h":85},{"x":910,"y":910,"w":100,"h":85},{"x":350,"y":260,"w":100,"h":110},{"x":1470,"y":260,"w":100,"h":110},{"x":350,"y":750,"w":100,"h":110},{"x":1470,"y":750,"w":100,"h":110}],"koBushes":[{"x":455,"y":105,"w":275,"h":105},{"x":1190,"y":105,"w":275,"h":105},{"x":455,"y":910,"w":275,"h":105},{"x":1190,"y":910,"w":275,"h":105},{"x":790,"y":245,"w":125,"h":70},{"x":1005,"y":245,"w":125,"h":70},{"x":790,"y":805,"w":125,"h":70},{"x":1005,"y":805,"w":125,"h":70},{"x":920,"y":505,"w":80,"h":110},{"x":510,"y":525,"w":145,"h":70},{"x":1265,"y":525,"w":145,"h":70}],"areaWalls":[{"x":700,"y":310,"w":90,"h":145},{"x":1130,"y":310,"w":90,"h":145},{"x":700,"y":665,"w":90,"h":145},{"x":1130,"y":665,"w":90,"h":145},{"x":460,"y":510,"w":115,"h":105},{"x":1345,"y":510,"w":115,"h":105},{"x":915,"y":145,"w":90,"h":80},{"x":915,"y":895,"w":90,"h":80}],"areaBushes":[{"x":510,"y":290,"w":160,"h":125},{"x":1250,"y":290,"w":160,"h":125},{"x":510,"y":705,"w":160,"h":125},{"x":1250,"y":705,"w":160,"h":125},{"x":855,"y":330,"w":210,"h":62},{"x":855,"y":728,"w":210,"h":62},{"x":700,"y":510,"w":90,"h":95},{"x":1130,"y":510,"w":90,"h":95}]};
function openArenaExactly(html,needle,replacement,label){
 const i=html.indexOf(needle);
 if(i<0||html.indexOf(needle,i+needle.length)>=0)throw Error('OPEN ARENA LAB anchor missing/drift: '+label);
 return html.slice(0,i)+replacement+html.slice(i+needle.length);
}
function openArenaMap(html,key,list){
 const rg=new RegExp('^const '+key+'=.*$','gm'),hits=html.match(rg);
 if(!hits||hits.length!==1)throw Error('OPEN ARENA LAB map anchor '+key);
 return html.replace(rg,'const '+key+'='+JSON.stringify(list)+';');
}
function buildOpenArena(base){
 const cfg=OPEN_ARENA;
 let html=base;
 if((html.match(/W=1536,H=860/g)||[]).length!==3)throw Error('expected exactly three world constants');
 html=html.replaceAll('W=1536,H=860','W='+cfg.width+',H='+cfg.height);
 for(const [key,list] of [['KO_WALLS',cfg.koWalls],['KO_BUSHES',cfg.koBushes],['AREA_WALLS',cfg.areaWalls],['AREA_BUSHES',cfg.areaBushes],['SPAWNS',cfg.spawn]])
  html=openArenaMap(html,key,list);
 // IMPORTANT: authoritative KO gas and client-side red-zone drawing must agree.
 html=openArenaExactly(html,'const m=clamp((t-28000)/1000*9,0,380)','const m=clamp((t-28000)/1000*12,0,505)','authoritative gas');
 html=openArenaExactly(html,'const GAS_DELAY=28_000,GAS_SPEED=9,GAS_CAP=380','const GAS_DELAY=28_000,GAS_SPEED=12,GAS_CAP=505','visual gas');
 html=openArenaExactly(html,'Math.max(Math.min(sw/1130,sh/680),sw/W,sh/H)','Math.max(Math.min(sw/'+cfg.followW+',sh/'+cfg.followH+'),sw/W,sh/H)','follow camera zoom');
 html=openArenaExactly(html,'window.__brawlV3QA=()=>({tacticalR3:true','window.__brawlV3QA=()=>({openArenaLab:true,worldWidth:W,worldHeight:H,tacticalR3:true','read-only QA');
 html=openArenaExactly(html,'<title>BRAWL 2vs2 | Shared Foundation V1</title>','<title>BRAWL 2vs2 | Open Arena LAB</title>','title');
 html=openArenaExactly(html,'<!DOCTYPE html>','<!DOCTYPE html>\\n<!-- OPEN ARENA LAB: independent test candidate, generated from baseline by scripts/build-open-arena-lab.cjs. Do NOT edit directly. -->','declaration');
 return html;
}

function main(arg){
 assert(['--check','--write'].includes(arg),'pass --check or --write');
 const html=buildOpenArena(fs.readFileSync(BASE,'utf8'));
 if(arg==='--write')fs.writeFileSync(OUTPUT,html);
 else assert.equal(fs.readFileSync(OUTPUT,'utf8'),html,'Open Arena candidate is stale');
 console.log('PASS Open Arena LAB '+(arg==='--write'?'generated':'byte-matched')+' '+html.length+' characters');
}
if(require.main===module)main(process.argv[2]);
module.exports={buildOpenArena,OPEN_ARENA,main};
