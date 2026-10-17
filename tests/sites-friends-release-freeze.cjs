// Public friend-online release freeze. Updating the NEXT lab must not silently
// replace the published 1vs1/2vs2 HTML. Change pinned blobs only on an
// explicitly authorized release promotion, after replaying the browser E2E.
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..');
const releases=[
 {file:'sites/BRAWL_FRIENDS_1vs1.html',blob:'2737ddf5ec2e32dc3a1be8cb320b90079739d433',title:'BRAWL 1vs1 | FRIEND ONLINE'},
 {file:'sites/BRAWL_FRIENDS_2vs2.html',blob:'53baf2e70f9a0ff9339fab121697b47a5e2a9d31',title:'BRAWL 2vs2 | FRIEND ONLINE'}
];
for(const release of releases){
 const bytes=fs.readFileSync(path.join(root,release.file));
 const sha=crypto.createHash('sha1').update(Buffer.from('blob '+bytes.length+'\0')).update(bytes).digest('hex');
 assert.equal(sha,release.blob,release.file+' is a deliberately pinned public snapshot, not an automatically changing lab copy');
 const html=bytes.toString('utf8');
 assert.match(html,/^<!DOCTYPE html>/i,'complete standalone public HTML');
 assert.match(html,/<\/html>\s*$/i,'complete standalone public HTML');
 assert(html.includes('<title>'+release.title+'</title>'),'public friend-online title');
 assert.doesNotMatch(html,/<iframe\b/i,'no remote page iframe dependency');
 assert.doesNotMatch(html,/<script[^>]+src\s*=/i,'game engine self-contained in public HTML');
 const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)];
 assert(scripts.length>=2,'public Firebase configuration and inline engine present');
 scripts.forEach((s,i)=>{if(s[1].trim())new vm.Script(s[1],{filename:release.file+'#'+i});});
 if(release.file.includes('2vs2')){
  for(const keyword of ['function quietAreaCanvasSafe(g)','const QUIET_AREA_CANVAS_REDRAW_MS=120',
    'function moveWithWallSubsteps(dx,dy)','function recordFirstTouchCanvasPaint(paintedAt)',
    'REMOTE_VISUAL_EXTRAPOLATE_MS=90','const HOST_ACTION_BATCH_LIMIT=6;'])
   assert(html.includes(keyword),'2vs2 public release must include tested optimization: '+keyword);
 }
 console.log('PASS frozen '+release.title+' ['+sha+']: standalone, inline JS, pinned public release');
}
