// Friends-only public beta preflight. No connection to live Firebase.
// Keep published normal friend pages byte-for-byte frozen.
'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const file=p=>fs.readFileSync(path.join(root,p),'utf8');
require('./sites-friends-release-freeze.cjs');
for(const [mode,normal,lab,beta,room,protocol] of [
 ['1vs1','sites/BRAWL_FRIENDS_1vs1.html','online/draft-duel-online-lab.html','sites/BRAWL_DRAFT_FRIENDS_BETA_1vs1.html','rooms',1031],
 ['2vs2','sites/BRAWL_FRIENDS_2vs2.html','online/draft-squad-online-lab.html','sites/BRAWL_DRAFT_FRIENDS_BETA_2vs2.html','rooms2v2',13012]
]){
 const n=file(normal),l=file(lab),s=file(beta);
 assert(s.startsWith('<!DOCTYPE html>')&&/<\/html>\s*$/.test(s),'complete standalone '+mode);
 assert(s.includes('<title>')&&s.includes('FRIEND BETA</title>'),'beta identity '+mode);
 assert(!/<iframe\b/i.test(s),'no remote iframe');
 assert(!/<script[^>]+src\s*=/i.test(s),'all gameplay code inline');
 assert(!s.includes('db.useEmulator('),'no localhost RTDB on friends release');
 assert(!s.includes('demo-brawl-draft-default-rtdb'),'never connect demo namespace');
 assert(!s.includes('ドラフト2vs2検証版はローカル専用'),'no localhost gate');
 assert(!s.includes("['localhost','127.0.0.1'].includes(location.hostname)"),'no localhost gate');
 assert(s.includes('https://*.firebaseio.com')&&s.includes('wss://*.firebaseio.com'),
   'remote RTDB CSP');
 assert(s.includes("window.BrawlOnlineConfig.get()"),'cloud DB endpoint used by runtime');
 assert(s.includes('https://mygame-df915-default-rtdb.firebaseio.com/'),'reuse current normal friend 1v1 DB by default');
 assert(n.includes('https://*.firebaseio.com'),'normal release supports cloud');
 assert(mode==='1vs1'
   ?s.includes("db.ref('rooms/'+code)")&&!s.includes('roomsDraft1v1/')
   :s.includes("const ROOT='rooms2v2',PROTOCOL=13012")&&!s.includes("const ROOT='roomsDraft2v2'"),
   'reused root / distinct draft protocol '+mode);
 assert(s.includes('PROTOCOL = '+protocol)||s.includes('PROTOCOL='+protocol),
   'protocol '+mode);
 const scripts=[...s.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)];
 assert(scripts.length>=2,'inline beta scripts');
 scripts.forEach((script,i)=>{if(script[1].trim())new vm.Script(script[1],{filename:beta+'#'+i});});
 const getStyle=t=>(t.match(/<style>([\s\S]*?)<\/style>/)||[])[1];
 assert(getStyle(s)===getStyle(l),'preserve tested draft iPad styling');
 if(mode==='2vs2'){
  assert(s.includes('function draftAdvance('),'2vs2 draft card geometry retained');
  assert(s.includes('function draftReflectAxis('),'2vs2 ricochet still enabled');
  assert(s.includes('squadGad2Action'),'2vs2 GAD2 button retained');
 }else{
  assert(s.includes('netDraftAdvanceBullet'),'1vs1 projectile draft retained');
 }
 console.log('PASS friends beta '+mode+': standalone + inline JS + existing UI + normal Firebase root + draft protocol');
}
