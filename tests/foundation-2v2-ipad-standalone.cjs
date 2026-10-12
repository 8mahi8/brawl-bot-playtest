// iPad Safari generated-page parity / touch and viewport anchors.
'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const {render,transforms}=require('../scripts/build-ipad-safari.cjs');
const source=fs.readFileSync('foundation/2v2-open-arena-team-guard-lab.html','utf8'),ipad=fs.readFileSync('foundation/2v2-ipad-safari.html','utf8');
assert.equal(ipad,render(source));
let restored=ipad;for(const t of [...transforms].reverse()){assert.equal(restored.split(t.to).length-1,1,'reverse '+t.key);restored=restored.replace(t.to,t.from);}
assert.equal(restored,source,'No changes to balance, map, BOT, or combat controls');
const script=ipad.match(/<script>([\s\S]*?)<\/script>/)?.[1];assert(script&&script.length>100000);
new vm.Script(script);
for(const term of ['viewport-fit=cover','height:100dvh','visualViewport?.addEventListener','ipadReady:true','brawl-ipad-safari-fit-v1',"canvas.addEventListener('pointercancel',endPointer)","canvas.setPointerCapture?.(e.pointerId)"])assert(ipad.includes(term),term);
console.log('PASS iPad shell and preserved game + touch handling');
