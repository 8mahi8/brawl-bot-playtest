// Keep school iPad release candidates in sync with gameplay-proven sources.
// No gameplay changes are allowed here; release overlays and CSP differences only.
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=f=>fs.readFileSync(path.resolve(__dirname,'..',f),'utf8');
const candidates=[
 {name:'1vs1 stable',base:'sites/1vs1-ipad-diagnostic-v2.html',candidate:'sites/1vs1-ipad-stable-v1.html'},
 {name:'2vs2 diagnostic',base:'sites/2vs2-ipad-bot-embed.html',candidate:'sites/2vs2-ipad-diagnostic-v1.html'}
];
for(const {name,base,candidate} of candidates){
 const old=read(base),next=read(candidate);
 const lastInline=s=>{const at=s.lastIndexOf('<script>');assert(at>0,'inline game script missing');return s.slice(at);};
 assert.equal(lastInline(next),lastInline(old),name+' gameplay script must remain byte-for-byte identical');
 assert(!next.includes('http-equiv="Content-Security-Policy"'),name+' candidate must not restore meta CSP');
 assert(!/<script[^>]+src\s*=/i.test(next),name+' candidate cannot need remote game scripts');
 if(name==='1vs1 stable'){
   assert(next.includes('id="brawlDiag"')&&next.includes('style="display:none;position:fixed;'),'1vs1 error-only banner hidden');
   assert(next.includes("if(el)el.style.display='block';show('エラー"),'1vs1 error banner can become visible');
 }else{
   assert(next.includes('id="brawlDiag2v2"'),'2vs2 diagnostic overlay exists');
   assert(next.indexOf('id="brawlDiag2v2"')<next.lastIndexOf('<script>'),'2vs2 diag before game');
 }
 console.log('PASS '+name+' gameplay source parity + standalone embed');
}
