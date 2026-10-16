// The next Google Sites release must be the SAME tested 2vs2 online engine.
// Never update the existing public BRAWL_FRIENDS_2vs2.html in this pipeline.
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const source=fs.readFileSync(path.join(root,'online/ipad-squad-v2-lab.html'),'utf8');
const release=fs.readFileSync(path.join(root,'sites/BRAWL_FRIENDS_2vs2_NEXT.html'),'utf8');
assert.equal(release,source,'2vs2 Google Sites NEXT embed must equal the emulator-tested dev HTML byte for byte');
assert.match(release,/^<!DOCTYPE html>/i,'complete standalone HTML');
assert.match(release,/<\/html>\s*$/i,'complete closing HTML');
assert.doesNotMatch(release,/<iframe\b/i,'no GitHub Pages iframe');
assert.doesNotMatch(release,/<script[^>]+src\s*=/i,'game scripts must be inlined (Firebase SDK loaded on demand)');
for(const name of [
 'const HOST_ACTION_BATCH_LIMIT=6;',
 'scheduleHostActionDispatch()',
 'if(!result.committed)',
 'const HP_PREVIEW_TTL=1400;',
 'REMOTE_VISUAL_EXTRAPOLATE_MS=90',
 'const guardian=h.owner',
 "watch(db.ref('.info/connected')",
 'async function registerPresence()'
]){
 assert(release.includes(name),'standalone NEXT missing tested online behavior: '+name);
}
const scripts=[...release.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)];
assert(scripts.length>=2,'Firebase config and full game engine embedded in HTML');
scripts.forEach((s,i)=>{if(s[1].trim())new vm.Script(s[1],{filename:'2vs2 NEXT script #'+i});});
console.log('PASS 2vs2 NEXT: standalone, byte-equal to emulator-tested dev, inline JS syntax and transport optimizations');
