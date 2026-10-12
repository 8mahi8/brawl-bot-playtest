// Builds a stand-alone tank-tuning comparison from the published Open Arena LAB.
// Never edits the foundation or the user's already-liked wider map.
// Usage: node scripts/build-tank-balance-lab.cjs --write | --check
'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const input=path.join(root,'foundation/2v2-open-arena-lab.html');
const output=path.join(root,'foundation/2v2-open-arena-tank-lab.html');
const TANK_BALANCE=Object.freeze({hp:160,guardianDamageFactor:.75});
function one(text,oldVal,newVal,label){const n=text.split(oldVal).length-1;assert.equal(n,1,'Tank LAB '+label+' anchor drift: '+n);return text.replace(oldVal,newVal);}
function buildTankBalance(html){
 let next=html;
 next=one(next,'tank:{label:"タンク",hp:180,','tank:{label:"タンク",hp:'+TANK_BALANCE.hp+',','tank maximum HP (both authority and UI)');
 next=one(next,'guardian=null,guardFactor=.65','guardian=null,guardFactor='+TANK_BALANCE.guardianDamageFactor,'guardian incoming-damage multiplier');
 next=one(next,'<title>BRAWL 2vs2 | Open Arena LAB</title>','<title>BRAWL 2vs2 | Tank Balance LAB</title>','document title');
 next=one(next,'QUIET COMBAT R4.1 · PREVIEW','OPEN ARENA · TANK 160HP · GUARD 25% · COMPARE','main menu label');
 next=one(next,'window.__brawlV3QA=()=>({openArenaLab:true','window.__brawlV3QA=()=>({tankBalanceLab:true,openArenaLab:true','read-only QA marker');
 next=one(next,'<!-- OPEN ARENA LAB: independent test candidate','<!-- TANK BALANCE COMPARISON: generated from Open Arena LAB; do not edit manually. -->\n<!-- OPEN ARENA LAB: independent test candidate','generated provenance');
 return next;
}
function main(flag){assert(['--check','--write'].includes(flag),'expected --check or --write');const built=buildTankBalance(fs.readFileSync(input,'utf8'));
 if(flag==='--write')fs.writeFileSync(output,built);else assert.equal(fs.readFileSync(output,'utf8'),built,'tank candidate is stale');
 console.log('PASS tank balance lab '+(flag==='--write'?'generated':'matches base')+' ('+built.length+' chars)');
}
if(require.main===module)main(process.argv[2]);
module.exports={buildTankBalance,TANK_BALANCE,main};
