// Proof: one shared online V2V early-shot change updates both normal and draft
// and the 1v1 variants/public pages do not inherit unrelated changes.
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {spec,makeAll,patchEarlyShots,safeTarget,validate}=require('../scripts/build-friends-online.cjs');
const root=path.resolve(__dirname,'..'),load=p=>fs.readFileSync(path.join(root,p),'utf8');
const normal=makeAll();
assert.deepEqual(Object.keys(normal),['normal.1vs1','normal.2vs2','draft.1vs1','draft.2vs2']);
const seenProtocols=new Set();
for(const [name,{mode,html}] of Object.entries(normal)){
 assert.equal(html,load(mode.source),'build must retain byte-identical behavior initially: '+name);
 validate(html,name,mode);
 assert(!seenProtocols.has(mode.protocol),'each mode has distinct protocol: '+name);
 seenProtocols.add(mode.protocol);
 assert(!mode.source.endsWith('BRAWL_FRIENDS_1vs1.html'),'no frozen public 1vs1 as template');
 assert(!mode.source.endsWith('BRAWL_FRIENDS_2vs2.html'),'no frozen public 2vs2 as template');
 assert(mode.output.startsWith('artifacts/friends-online/'),'isolated staging only');
 assert(!spec.forbiddenWritePrefixes.includes(mode.source),'forbidden target '+name);
}
const original=load(spec.modules.squadEarlyShots);
assert(original.includes('receipt?.status===')&&original.includes('bomberSmoothPoint'),'source is complete early-shot and Bomber runtime');
const simulatedEdit=original.replace('age>950','age>949');
assert.notEqual(simulatedEdit,original,'targeted edit must exist');
const updated=makeAll(simulatedEdit);
for(const name of ['normal.2vs2','draft.2vs2']){
 assert.notEqual(updated[name].html,normal[name].html,'single source edit propagates to '+name);
 assert(updated[name].html.includes('age>949'),'updated source injected in '+name);
}
for(const name of ['normal.1vs1','draft.1vs1'])
 assert.equal(updated[name].html,normal[name].html,'2vs2 renderer cannot touch '+name);
assert.throws(()=>patchEarlyShots('empty',original),/missing block/);
for(const malformed of ['../sites/public.html','artifacts/friends-online/../../sites/public.html','sites/BRAWL_FRIENDS_2vs2.html'])
 assert.throws(()=>safeTarget(malformed),/staging|unsafe|escaped/);
assert.equal(load(spec.modes['normal.1vs1'].source),normal['normal.1vs1'].html,'read-only test no mutations');
console.log('PASS four standalone friends builds reproducible; one shared 2vs2 source change reaches both and cannot change 1vs1/public releases');
