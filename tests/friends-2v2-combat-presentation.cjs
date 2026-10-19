// BRAWL V3.2: keep six shared host combat/presentation functions identical.
// Input HTML is pinned; the generator must touch STAGING outputs only.
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {spec,makeAll,validate,patchSquadPresentation,squadPresentationBlocks,SQUAD_PRESENTATION_NAMES}=require('../scripts/build-friends-online.cjs');
const root=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const moduleSource=read(spec.modules.squadCombatPresentation);
const parts=squadPresentationBlocks(moduleSource),baseline=makeAll();
assert.equal(parts.length,6);
assert.deepEqual(parts.map(p=>p.name),SQUAD_PRESENTATION_NAMES);
assert.equal(new Set(parts.map(p=>p.name)).size,6);
const generatedMarker='BEGIN GENERATED SHARED 2V2 PRESENTATION';
for(const name of ['normal.2vs2','draft.2vs2']){
 const legacy=read(spec.modes[name].source),html=baseline[name].html;
 assert.equal(legacy.includes(generatedMarker),false,'existing user candidate HTML must not be migrated');
 assert.equal(html.split(generatedMarker).length-1,1,'one generated module '+name);
 for(const part of parts){
  assert.equal(legacy.split(part.body).length-1,1,'legacy must contain exact byte-identical '+name+'/'+part.name);
  assert.equal(html.split(part.body).length-1,1,'staging must retain full unchanged function '+name+'/'+part.name);
  const fn=new RegExp('(?:async\\s+)?function\\s+'+part.name+'\\s*\\(','g');
  assert.equal([...html.matchAll(fn)].length,1,'exactly one active function '+name+'/'+part.name);
 }
 assert.throws(()=>patchSquadPresentation(html,moduleSource,name),/already injected/);
 assert(!html.includes('db.useEmulator('),'no emulator hooks in player HTML');
 validate(html,name,spec.modes[name]);
}
for(const name of ['normal.1vs1','draft.1vs1']){
 assert(!baseline[name].html.includes(generatedMarker),'no 2v2 helper injection into 1v1');
 assert(!spec.modes[name].modules.includes('squadCombatPresentation'));
}
const mutation=moduleSource.replace('combatTickCalls++;','combatTickCalls+=1;');
assert.notEqual(mutation,moduleSource,'mutated future canonical source');
const updated=makeAll(null,null,mutation);
for(const name of ['normal.2vs2','draft.2vs2']){
 assert(updated[name].html.includes('combatTickCalls+=1;'),'one change propagates to '+name);
 assert.notEqual(updated[name].html,baseline[name].html,'2v2 stage changed '+name);
}
for(const name of ['normal.1vs1','draft.1vs1'])
 assert.equal(updated[name].html,baseline[name].html,'1v1 unchanged after 2v2 shared edit');
assert.throws(()=>patchSquadPresentation('not a candidate',moduleSource,'normal.2vs2'),/anchor drift|shared function drift/);
console.log('PASS V3.2 six exact shared 2v2 combat/presentation functions, one definition each, staging-only, 1v1 isolation, future change reaches both 2v2 modes');
