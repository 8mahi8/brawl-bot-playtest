// 2v2 online V3 foundation: prove host action, combat and position synchronizers
// are a single source without changing legacy source or production releases.
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {spec,makeAll,patchSquadNetworkCombat}=require('../scripts/build-friends-online.cjs');
const root=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const src=read(spec.modules.squadNetworkCombat);
const rx=/\/\* BEGIN SHARED SQUAD ([A-Za-z][A-Za-z0-9]*) \*\/\n([\s\S]*?)\n\/\* END SHARED SQUAD \1 \*\//g;
const modules=[...src.matchAll(rx)].map(m=>({name:m[1],body:m[2]}));
assert.equal(modules.length,13,'thirteen unchanged transport/combat functions extracted');
assert.deepEqual(new Set(modules.map(m=>m.name)).size,modules.length);
const originalModes=['normal.2vs2','draft.2vs2'];
const out=makeAll();
for(const name of originalModes){
 const legacy=read(spec.modes[name].source),html=out[name].html;
 assert(html.includes('BEGIN GENERATED SHARED SQUAD NETWORK COMBAT'),name+' runtime inserted');
 for(const item of modules){
  assert.equal(legacy.split(item.body).length-1,1,'original '+name+' '+item.name+' exact match');
  assert.equal(html.split(item.body).length-1,1,'generated '+name+' '+item.name+' exactly once');
 }
 for(const bad of ['db.useEmulator(','window.eval(','<script src='])
  assert(!html.includes(bad),'standalone no dangerous bridge: '+bad);
}
for(const name of ['normal.1vs1','draft.1vs1'])
 assert(!out[name].html.includes('BEGIN GENERATED SHARED SQUAD NETWORK COMBAT'),
  name+' unaffected by 2v2-only networking');
// A shared change updates both 2v2 generated outputs but *not* either 1v1.
const from="if(!clockReady)return;",to="if(!clockReady){return;}";const altered=src.replace(from,to);
assert.notEqual(altered,src);
const changed=makeAll(null,altered);
for(const name of originalModes){
 assert.notEqual(changed[name].html,out[name].html,'shared code edit propagates to '+name);
 assert(changed[name].html.includes(to),'common network edit visible in '+name);
}
for(const name of ['normal.1vs1','draft.1vs1'])
 assert.equal(changed[name].html,out[name].html,'no 2vs2 network code leaks into '+name);
assert.throws(()=>patchSquadNetworkCombat(out['normal.2vs2'].html,src,'normal.2vs2'),
 /duplicate|anchor drift|legacy/,'refuse to inject twice');
console.log('PASS squad V3: 13 exact shared network/combat functions in both 2vs2 builds, no duplications; one edit reaches both and no public/1vs1 regression');
