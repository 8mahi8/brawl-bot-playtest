// BRAWL friends-online foundation v1. All outputs are complete standalone HTML.
// --check: fail if a mode drifts from the canonical shared module; no writes.
// --emit: assemble all FOUR variants under artifacts/friends-online only.
// --sync: explicit opt-in for the two NONPUBLIC 2v2 latency CANDIDATE files;
//         never write existing public releases, production Firebase or Google Sites.
'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const vm=require('node:vm'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..');
const spec=JSON.parse(fs.readFileSync(path.join(root,'shared/friends-online-modes.json'),'utf8'));
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const ACTION_BEGIN='// Never feed early remote visuals into host collision, hit preview or RTDB.';
const ACTION_END='\n function visualCombatNow()';
const safeOutputPrefix='artifacts/friends-online/';
function uniqueSpan(html,start,end,label){
 const begin=html.indexOf(start),stop=html.indexOf(end,begin+start.length);
 assert(begin>=0&&stop>begin,label+' missing block');
 assert.equal(html.indexOf(start,begin+start.length),-1,label+' duplicate block start');
 assert.equal(html.indexOf(end,stop+end.length),-1,label+' duplicate block end');
 return {begin,stop};
}
function patchEarlyShots(html,canonical){
 const x=uniqueSpan(html,ACTION_BEGIN,ACTION_END,'squad early-shot visuals');
 return html.slice(0,x.begin)+canonical+html.slice(x.stop);
}
function sharedSection(html,name){
 const begin='BEGIN SHARED '+name,end='END SHARED '+name;
 const span=uniqueSpan(html,begin,end,name);
 return html.slice(span.begin,span.stop);
}
function validate(html,modeName,mode){
 assert(html.startsWith('<!DOCTYPE html>')||html.startsWith('<!doctype html>'),'doctype '+modeName);
 const protocol=new RegExp('(?:PROTOCOL\\s*=\\s*)'+mode.protocol+'(?!\\d)');
 assert(protocol.test(html),'protocol contract '+modeName);
 if(mode.roomRoot==='rooms2v2')assert(html.includes("ROOT='rooms2v2'"),'squad RTDB root '+modeName);
 else assert(html.includes("rooms/'+code"),'duel RTDB root '+modeName);
 assert(!html.includes("db.useEmulator("),'emulator code forbidden in standalone output '+modeName);
 assert(!/<script\b[^>]*\bsrc\s*=/.test(html),'remote script dependency '+modeName);
 assert(html.includes("script-src 'unsafe-inline'"),'strict inline CSP '+modeName);
 const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)];
 assert(scripts.length>=1,'inline script missing '+modeName);
 scripts.forEach((m,i)=>{if(m[1].trim())new vm.Script(m[1],{filename:modeName+'#'+i});});
 assert(html.includes('window.__brawlV3QA')||html.includes('window.__brawlV29QA'),'QA hook '+modeName);
 return true;
}
function makeAll(moduleOverride=null){
 assert.equal(spec.schemaVersion,1);
 const canonical=moduleOverride===null?read(spec.modules.squadEarlyShots):moduleOverride;
 assert(canonical.startsWith(ACTION_BEGIN)&&canonical.endsWith('\n'),'bad shared early-shot source');
 assert(!canonical.includes(ACTION_END),'source must not contain marker after block');
 const outputs={};
 for(const [name,mode] of Object.entries(spec.modes)){
  let html=read(mode.source);
  if(mode.modules.includes('squadEarlyShots'))html=patchEarlyShots(html,canonical);
  validate(html,name,mode);
  outputs[name]={mode,html,hash:crypto.createHash('sha256').update(html).digest('hex')};
 }
 const entries=Object.values(outputs).map(o=>o.html);
 for(const type of ['WEAPON RULES','PROJECTILE PHYSICS','ABILITIES']){
  const base=sharedSection(entries[0],type);
  for(let i=1;i<entries.length;i++)assert.equal(sharedSection(entries[i],type),base,'cross-mode '+type+' drift');
 }
 assert.equal(Object.keys(outputs).length,4,'exactly four modes required');
 return outputs;
}
function safeTarget(rel){
 assert(rel.startsWith(safeOutputPrefix),'staging output must remain under artifacts/friends-online');
 assert(!rel.includes('..')&&!path.isAbsolute(rel),'unsafe output path');
 const target=path.resolve(root,rel);
 assert(target.startsWith(path.resolve(root,'artifacts/friends-online')+path.sep),'write escaped staging root');
 return target;
}
function main(flag){
 assert(['--check','--emit','--sync'].includes(flag),'use --check, --emit or --sync');
 const output=makeAll();
 for(const [name,data] of Object.entries(output)){
  const {mode,html,hash}=data,original=read(mode.source);
  if(flag==='--check'){
   assert.equal(original,html,'stale '+name+' standalone HTML; regenerate via --sync after shared edit');
   console.log('PASS '+name+' canonical source and standalone ('+hash.slice(0,12)+')');
  }else if(flag==='--emit'){
   const dest=safeTarget(mode.output);fs.mkdirSync(path.dirname(dest),{recursive:true});
   fs.writeFileSync(dest,html);console.log('EMIT '+name+' '+mode.output+' sha256='+hash);
  }else if(flag==='--sync'){
   // Source files are output candidates ONLY. Public baseline and 1v1 remain frozen.
   if(!mode.modules.includes('squadEarlyShots'))continue;
   assert(mode.source.endsWith('_LATENCY_CANDIDATE.html'),'sync may update only two latency candidates');
   assert(!spec.forbiddenWritePrefixes.includes(mode.source),'public release blocked');
   fs.writeFileSync(path.join(root,mode.source),html);
   console.log('SYNC shared early-shot runtime -> '+mode.source+' sha256='+hash);
  }
 }
 if(flag==='--check')console.log('PASS four-mode reproducible standalone friends foundation, no public writes');
 if(flag==='--emit')console.log('PASS four standalone Google Sites copy-ready HTMLs; publication is always manual');
}
if(require.main===module)main(process.argv[2]);
module.exports={spec,makeAll,validate,patchEarlyShots,sharedSection,safeTarget,main};
