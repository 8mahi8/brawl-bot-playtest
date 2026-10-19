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
const POSITION_BEGIN='// Only active motion needs the 80ms network cadence.';
const POSITION_END='\nfunction update(dt,movementDt=dt)';
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

// This tiny 2vs2 policy is identical in normal and draft. Replace it as one
// block while preserving the original room, host, action and position paths.
function patchPositionPublish(html,canonical){
 const x=uniqueSpan(html,POSITION_BEGIN,POSITION_END,'2vs2 position publish policy');
 return html.slice(0,x.begin)+canonical+html.slice(x.stop);
}
function replaceOnce(source,oldText,replacement,label){
 const count=source.split(oldText).length-1;
 assert.equal(count,1,'control layout anchor drift '+label+' ('+count+')');
 return source.replace(oldText,replacement);
}
// Build-only transformation. The existing player-facing candidate HTML remains
// byte-for-byte untouched until promotion is separately approved.
function patchControlLayout(html,source,modeName){
 assert(source.includes('const BrawlControlLayoutV1='),'layout module missing');
 assert(!html.includes('BrawlControlLayoutV1'),'legacy source already contains injected layout module: '+modeName);
 const isDuel=modeName.endsWith('1vs1');
 const mark=isDuel?"  const BUTTON_LAYOUT_KEY='brawl_v28_buttons';":'const layoutDefault={gad:';
 if(isDuel)html=replaceOnce(html,mark,source+'\n'+mark,modeName+' insert module');
 else html=replaceOnce(html,mark,source+'\n'+mark,modeName+' insert module');
 if(isDuel){
  html=replaceOnce(html,
   'buttonLayout[key]={x:clamp(p.x,0,1),y:clamp(p.y,0,1),size:clamp(p.size,44,100)};',
   "buttonLayout[key]=BrawlControlLayoutV1.restorePoint(p,buttonLayout[key],'duel');",modeName+' saved settings');
  html=replaceOnce(html,
   'const displaySize=Math.min(p.size,Math.max(40,h*.36),Math.max(40,w*.42));',
   "const displaySize=BrawlControlLayoutV1.displaySize(p,w,h,'duel');",modeName+' render size');
  html=replaceOnce(html,
   'const x=clamp(p.x*w,displaySize/2+4,w-displaySize/2-4);\n      const y=clamp(p.y*h,displaySize/2+4,h-displaySize/2-4);',
   'const {x,y}=BrawlControlLayoutV1.center(p,w,h,displaySize);',modeName+' render center');
  html=replaceOnce(html,
   'const size=Math.min(p.size,Math.max(40,rect.height*.36),Math.max(40,rect.width*.42));',
   "const size=BrawlControlLayoutV1.displaySize(p,rect.width,rect.height,'duel');",modeName+' drag size');
  html=replaceOnce(html,
   'p.x=clamp((e.clientX-rect.left)/rect.width,(size/2+4)/rect.width,1-(size/2+4)/rect.width);\n    p.y=clamp((e.clientY-rect.top)/rect.height,(size/2+4)/rect.height,1-(size/2+4)/rect.height);',
   'Object.assign(p,BrawlControlLayoutV1.dragPoint(e,rect,size));',modeName+' drag coordinate');
 }else{
  html=replaceOnce(html,
   'layout[k]={x:clamp(Number(v[k].x)||layoutDefault[k].x,.07,.93),y:clamp(Number(v[k].y)||layoutDefault[k].y,.12,.91),size:clamp(Number(v[k].size)||layoutDefault[k].size,44,100)}',
   "layout[k]=BrawlControlLayoutV1.restorePoint(v[k],layoutDefault[k],'squad')",modeName+' squad saved settings');
  if(modeName==='draft.2vs2')html=replaceOnce(html,
   'layout.gad2={x:clamp(saved.x,.07,.93),y:clamp(saved.y,.12,.91),size:clamp(saved.size,44,100)};',
   "layout.gad2=BrawlControlLayoutV1.restorePoint(saved,layoutDefault.gad2,'squad-gad2');",modeName+' gad2 settings');
  html=replaceOnce(html,
   "const size=Math.min(p.size,Math.max(30,Math.min(sw,sh)*.30));el.style.width=size+'px';el.style.height=size+'px';el.style.left=clamp(p.x*sw,size/2+4,sw-size/2-4)+'px';el.style.top=clamp(p.y*sh,size/2+4,sh-size/2-4)+'px';",
   "const size=BrawlControlLayoutV1.displaySize(p,sw,sh,'squad'),{x,y}=BrawlControlLayoutV1.center(p,sw,sh,size);el.style.width=size+'px';el.style.height=size+'px';el.style.left=x+'px';el.style.top=y+'px';",
   modeName+' mock action positions');
  html=replaceOnce(html,
   "sz=Math.min(p.size,Math.max(30,Math.min(sw,sh)*.30));e.style.width=sz+'px';e.style.height=sz+'px';e.style.left=clamp(p.x*sw,sz/2+4,sw-sz/2-4)+'px';e.style.top=clamp(p.y*sh,sz/2+4,sh-sz/2-4)+'px';",
   "sz=BrawlControlLayoutV1.displaySize(p,sw,sh,'squad'),{x,y}=BrawlControlLayoutV1.center(p,sw,sh,sz);e.style.width=sz+'px';e.style.height=sz+'px';e.style.left=x+'px';e.style.top=y+'px';",
   modeName+' live action positions');
  html=replaceOnce(html,
   'layout[k].x=clamp((ev.clientX-stage.left)/stage.width,(sz/2+4)/stage.width,1-(sz/2+4)/stage.width);\n layout[k].y=clamp((ev.clientY-stage.top)/stage.height,(sz/2+4)/stage.height,1-(sz/2+4)/stage.height);applyLayout();',
   'Object.assign(layout[k],BrawlControlLayoutV1.dragPoint(ev,stage,sz));applyLayout();',
   modeName+' mock drag positions');
  if(modeName==='draft.2vs2'){
   html=replaceOnce(html,
    "const size=Math.min(p.size,Math.max(30,Math.min(sw,sh)*.30));\n b.style.width=size+'px';b.style.height=size+'px';",
    "const size=BrawlControlLayoutV1.displaySize(p,sw,sh,'squad');\n  b.style.width=size+'px';b.style.height=size+'px';",
    modeName+' gad2 size');
   html=replaceOnce(html,
    "b.style.left=clamp(p.x*sw,size/2+4,sw-size/2-4)+'px';\n b.style.top=clamp(p.y*sh,size/2+4,sh-size/2-4)+'px';",
    "const {x,y}=BrawlControlLayoutV1.center(p,sw,sh,size);\n  b.style.left=x+'px';\n  b.style.top=y+'px';",
    modeName+' gad2 position');
  }
 }
 return html;
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
function makeAll(moduleOverride=null,positionOverride=null){
 assert.equal(spec.schemaVersion,1);
 const canonical=moduleOverride===null?read(spec.modules.squadEarlyShots):moduleOverride;
 assert(canonical.startsWith(ACTION_BEGIN)&&canonical.endsWith('\n'),'bad shared early-shot source');
 assert(!canonical.includes(ACTION_END),'source must not contain marker after block');
 const layoutSource=read(spec.modules.controlLayout);
 const positionSource=positionOverride===null?read(spec.modules.squadPositionPublish):positionOverride;
 assert(positionSource.startsWith(POSITION_BEGIN)&&positionSource.endsWith('\n'),'invalid position predicate module');
 assert(!positionSource.includes(POSITION_END),'position predicate includes next function');
 const outputs={};
 for(const [name,mode] of Object.entries(spec.modes)){
  let html=read(mode.source);
  if(mode.modules.includes('squadEarlyShots'))html=patchEarlyShots(html,canonical);
  if(mode.modules.includes('squadPositionPublish'))html=patchPositionPublish(html,positionSource);
  if(mode.modules.includes('controlLayout'))html=patchControlLayout(html,layoutSource,name);
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
   const gitBlob=crypto.createHash('sha1').update('blob '+Buffer.byteLength(original)+'\0'+original).digest('hex');
   assert.equal(gitBlob,mode.sourceGitBlob,'unreviewed candidate source drift: '+name+'; update manifest snapshot after review');
   if(mode.modules.includes('squadEarlyShots'))
    assert.equal(patchEarlyShots(original,read(spec.modules.squadEarlyShots)),original,
      '2v2 candidate source has stale early-shot runtime: '+name);
   if(mode.modules.includes('squadPositionPublish'))
    assert.equal(patchPositionPublish(original,read(spec.modules.squadPositionPublish)),original,
      '2v2 candidate source has stale position publish policy: '+name);
   assert(html.includes('BrawlControlLayoutV1'),'control module must be inlined for '+name);
   console.log('PASS '+name+' canonical source and standalone ('+hash.slice(0,12)+')');
  }else if(flag==='--emit'){
   const dest=safeTarget(mode.output);fs.mkdirSync(path.dirname(dest),{recursive:true});
   fs.writeFileSync(dest,html);console.log('EMIT '+name+' '+mode.output+' sha256='+hash);
  }else if(flag==='--sync'){
   // Source files are output candidates ONLY. Public baseline and 1v1 remain frozen.
   if(!mode.modules.includes('squadEarlyShots'))continue;
   assert(mode.source.endsWith('_LATENCY_CANDIDATE.html'),'sync may update only two latency candidates');
   assert(!spec.forbiddenWritePrefixes.includes(mode.source),'public release blocked');
   const sourceSynced=patchEarlyShots(original,read(spec.modules.squadEarlyShots));
   fs.writeFileSync(path.join(root,mode.source),sourceSynced);
   console.log('SYNC shared early-shot only (no UI migration) -> '+mode.source);
  }
 }
 if(flag==='--check')console.log('PASS four-mode reproducible standalone friends foundation, no public writes');
 if(flag==='--emit')console.log('PASS four standalone Google Sites copy-ready HTMLs; publication is always manual');
}
if(require.main===module)main(process.argv[2]);
module.exports={spec,makeAll,validate,patchEarlyShots,patchPositionPublish,patchControlLayout,sharedSection,safeTarget,main};
