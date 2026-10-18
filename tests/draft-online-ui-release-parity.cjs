// Protect the school-iPad standard/draft UI contract before independent release.
// This is structural parity only; physical iPad input and performance need separate QA.
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const pairs=[
 {mode:'1vs1',normal:'online/ipad-duel-v2-lab.html',
  draft:'online/draft-duel-online-lab.html',
  extra:['onlineDraftOverlay','onlineDraftHud','onlineDraftReplace'],
  room:'roomsDraft1v1',rules:'network/emulator/DRAFT_ONLINE_E2E_TEST_ONLY.rules.json'},
 {mode:'2vs2',normal:'online/ipad-squad-v2-lab.html',
  draft:'online/draft-squad-online-lab.html',
  extra:['squadDraftOverlay','squadDraftHud','squadReplace','squadGad2Action'],
  room:'roomsDraft2v2',rules:'network/emulator/DRAFT_SQUAD_E2E_TEST_ONLY.rules.json'}
];
const style=s=>{
 const matches=[...s.matchAll(/<style(?:\s[^>]*)?>([\s\S]*?)<\/style>/gi)];
 assert.equal(matches.length,1,'exactly one embedded stylesheet expected');
 return matches[0][1];
};
function tagsById(html){
 const tags=new Map();
 for(const match of html.matchAll(/<([a-z][\w:-]*)\b[^<>]*\bid=(["'])([\w-]+)\2[^<>]*>/gi)){
  const id=match[3],tag=match[0].replace(/\s+/g,' ').trim();
  assert(!tags.has(id),'duplicate element ID: '+id);
  tags.set(id,tag);
 }
 return tags;
}
for(const {mode,normal,draft,extra,room,rules} of pairs){
 const normalHtml=read(normal),draftHtml=read(draft);
 const normalCss=style(normalHtml),draftCss=style(draftHtml);
 assert(draftCss.startsWith(normalCss),
   mode+' draft must preserve all original CSS verbatim; append scoped draft styling only');
 const extension=draftCss.slice(normalCss.length);
 assert(extension.length>0,'expected draft-only stylesheet additions: '+mode);
 // Keep appended styles off existing attack, camera, map and HUD selectors.
 // Base UI is inherited byte-for-byte. Only the draft overlay and the
 // known intentionally hidden normal-mode controls may be overridden.
 const approved=mode==='1vs1'
   ?['#soloBtn','#joinBotBtn','#onlineDbInput']
   :['#soloBtn','#joinBotBtn','#modePick','.online-config'];
 const noComments=extension.replace(/\/\*[\s\S]*?\*\//g,'');
 const ruleHeads=[...noComments.matchAll(/(?:^|})\s*([^{}]+)\{/g)].map(m=>m[1].trim());
 for(const head of ruleHeads){
  if(head.startsWith('@media'))continue;
  for(const selector of head.split(',').map(x=>x.trim())){
   assert(selector.startsWith(mode==='1vs1'?'#onlineDraft':'#squadDraft')||
     approved.includes(selector),
     mode+' appended CSS unexpectedly changes normal UI selector: '+selector);
  }
 }
 const baseTags=tagsById(normalHtml),draftTags=tagsById(draftHtml);
 for(const [id,tag] of baseTags)
   assert.equal(draftTags.get(id),tag,mode+' non-draft markup/attributes differ: '+id);
 const added=[...draftTags.keys()].filter(id=>!baseTags.has(id));
 assert(added.every(id=>extra.includes(id)),
   mode+' new DOM IDs must be registered as draft-only: '+added.join(','));
 for(const id of extra)assert(draftHtml.includes(id),mode+' missing expected draft UI ID '+id);
 for(const handler of ["addEventListener('pointerdown'","addEventListener('pointermove'",
   "addEventListener('pointerup'","addEventListener('pointercancel'",
   "addEventListener('keydown'","addEventListener('keyup'",
   "addEventListener('resize'","addEventListener('visibilitychange'"]){
  assert(normalHtml.includes(handler)&&draftHtml.includes(handler),
    mode+' baseline touch/keyboard/window handler missing: '+handler);
 }
 // Localhost-only labs cannot be mistaken for independently publishable files.
 assert(draftHtml.includes("db.useEmulator('127.0.0.1',9000)"),mode+' must use local RTDB');
 assert(draftHtml.includes("['localhost','127.0.0.1'].includes(location.hostname)"),
   mode+' must reject cloud hosts');
 const csp=draftHtml.match(/<meta\s+http-equiv=["']Content-Security-Policy["']\s+content=(["'])([\s\S]*?)\1/i);
 assert(csp,'draft must set a CSP');
 const connects=csp[2].split(';').find(x=>x.trim().startsWith('connect-src'));
 assert(connects&&connects.includes('127.0.0.1:9000')&&!/firebaseio|firebasedatabase|googleapis/i.test(connects),
   mode+' draft must not connect to production Firebase');
 assert(!fs.existsSync(path.join(root,'sites/BRAWL_DRAFT_'+mode+'.html')),
   mode+' draft standalone public page requires explicit release approval');
 const emulatorRules=JSON.parse(read(rules)).rules;
 assert.equal(emulatorRules['.read'],false);
 assert.equal(emulatorRules['.write'],false);
 assert.deepEqual(Object.keys(emulatorRules).sort(),['.read','.write',room].sort());
 assert.equal(emulatorRules[room]['.read'],true,'local emulator only permissive read');
 assert.equal(emulatorRules[room]['.write'],true,'local emulator only permissive write');
 console.log('PASS '+mode+' UI: all '+baseTags.size+
   ' existing tagged elements and '+normalCss.length+
   ' CSS chars preserved; '+added.length+' draft-only IDs; localhost isolated');
}
const release=JSON.parse(read('network/release/DRAFT_DENY_ALL_BASELINE.rules.json'));
assert.deepEqual(release,{rules:{'.read':false,'.write':false}},
 'release baseline must fail closed; do not copy open emulator-only rules');
console.log('PASS release baseline: deny every unauthenticated/unimplemented draft operation');
