// Publication boundary test: the public Github Pages games are BOT-only,
// while offline networking lab modules are NOT connected to any live backend.
'use strict';
const fs=require('node:fs'),assert=require('node:assert/strict');
const paths=[
 '1v1.html','index.html',
 'src/modes/1v1.template.html','src/modes/2v2.template.html',
 'foundation/1v1-foundation-v1.html','foundation/2v2-foundation-v1.html'
];
for(const p of paths){
 const s=fs.readFileSync(p,'utf8');
 assert(/connect-src 'none'/.test(s),'public BOT CSP must forbid outbound connections: '+p);
 assert(!/https?:\/\/[^\s"'<>]*firebaseio\.com/i.test(s),'never publish real Firebase database URI: '+p);
 assert(!/https?:\/\/[^\s"'<>]*firebasedatabase\.app/i.test(s),'never publish real Firebase database URI: '+p);
 if(p.includes('1v1'))assert(/function ensureFirebase\(\)\s*\{\s*throw/.test(s),'1v1 Firebase disabled: '+p);
 else assert(/async function ensureDB\(\)\s*\{\s*throw/.test(s),'2v2 Firebase disabled: '+p);
 assert(!s.includes("require('../network/lab/"),'network lab may not be included in playtest: '+p);
 console.log('PASS offline public isolation '+p);
}
for(const p of ['network/lab/one-vs-one.cjs','network/lab/two-vs-two.cjs']){
 const s=fs.readFileSync(p,'utf8');
 assert(!/fetch\s*\(/.test(s),'no network calls in lab model '+p);
 assert(!/firebase\.database\(/.test(s),'no live Firebase references '+p);
 assert(s.includes('ONLINE LAB ONLY'),'label offline test module '+p);
}
console.log('PASS network design studies cannot silently enable Firebase or publish credentials');
