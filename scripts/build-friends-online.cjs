// BRAWL friends-online foundation v1. All outputs are complete standalone HTML.
// --check: fail if a mode drifts from the canonical shared module; no writes.
// --emit: assemble all FOUR variants under artifacts/friends-online only.
// --sync: explicit opt-in for the two NONPUBLIC 2v2 latency CANDIDATE files;
//         never write existing public releases, production Firebase or Google Sites.
'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const vm=require('node:vm'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..');
const spec=JSON.parse(fs.readFileSync(path.join(root,'shared/friends-online-modes.json'),'utf8'));
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const ACTION_BEGIN='// Never feed early remote visuals into host collision, hit preview or RTDB.';
const ACTION_END='\n function visualCombatNow()';
const PROJECTILE_BEGIN='function squadRemoteProjectileVisual(';
const PROJECTILE_END='function drawSmoothProjectiles(dt){';
const POSITION_BEGIN='// Only active motion needs the 80ms network cadence.';
const POSITION_END='function update(dt,movementDt=dt)';
const safeOutputPrefix='artifacts/friends-online/';
function uniqueSpan(html,start,end,label){
 const begin=html.indexOf(start),stop=html.indexOf(end,begin+start.length);
 assert(begin>=0&&stop>begin,label+' missing block');
 assert.equal(html.indexOf(start,begin+start.length),-1,label+' duplicate block start');
 assert.equal(html.indexOf(end,stop+end.length),-1,label+' duplicate block end');
 return {begin,stop};
}
function patchEarlyShots(html,canonical){
 const x=uniqueSpan(html,ACTION_BEGIN,ACTION_END,'squad early-shot visuals');
 return html.slice(0,x.begin)+canonical+html.slice(x.stop);
}

// Authoritative 2v2 projectiles are displayed at their already-advanced
// snapshot coordinates, not replayed again from their muzzle.
function patchSquadProjectileVisual(html,canonical){
 assert(canonical.startsWith(PROJECTILE_BEGIN)&&canonical.endsWith('\n'),'invalid shared projectile renderer');
 assert(!canonical.includes(PROJECTILE_END),'projectile renderer overlaps next function');
 const span=uniqueSpan(html,PROJECTILE_BEGIN,PROJECTILE_END,'2v2 host projectile visualization');
 const patched=html.slice(0,span.begin)+canonical+html.slice(span.stop);
 // Stage-only: the pinned candidate files and Google Sites HTML remain intact.
 assert(canonical.includes('function squadProjectileVisualAheadSeconds('),'missing V5.3 visual pacing policy');
 return replaceOnce(patched,
  '  const ahead=game?.clock?clamp((serverNow()-game.clock.wallAt)/1000,0,.11):0;',
  '  const ahead=game?.clock?squadProjectileVisualAheadSeconds(serverNow()-game.clock.wallAt):0;',
  'V5.3 2vs2 projectile extrapolation');

}

// Build-only position cadence extraction; game HTML inputs remain immutable.
function patchPositionPublish(html,canonical){
 const x=uniqueSpan(html,POSITION_BEGIN,POSITION_END,'2vs2 position publish policy');
 return html.slice(0,x.begin)+canonical+html.slice(x.stop);
}
function replaceOnce(source,oldText,replacement,label){
 const count=source.split(oldText).length-1;
 assert.equal(count,1,'control layout anchor drift '+label+' ('+count+')');
 return source.replace(oldText,replacement);
}
// Build-only transformation. The existing player-facing candidate HTML remains
// byte-for-byte untouched until promotion is separately approved.
function patchControlLayout(html,source,modeName){
 assert(source.includes('const BrawlControlLayoutV1='),'layout module missing');
 assert(!html.includes('BrawlControlLayoutV1'),'legacy source already contains injected layout module: '+modeName);
 const isDuel=modeName.endsWith('1vs1');
 const mark=isDuel?"  const BUTTON_LAYOUT_KEY='brawl_v28_buttons';":'const layoutDefault={gad:';
 if(isDuel)html=replaceOnce(html,mark,source+'\n'+mark,modeName+' insert module');
 else html=replaceOnce(html,mark,source+'\n'+mark,modeName+' insert module');
 if(isDuel){
  html=replaceOnce(html,
   'buttonLayout[key]={x:clamp(p.x,0,1),y:clamp(p.y,0,1),size:clamp(p.size,44,100)};',
   "buttonLayout[key]=BrawlControlLayoutV1.restorePoint(p,buttonLayout[key],'duel');",modeName+' saved settings');
  html=replaceOnce(html,
   'const displaySize=Math.min(p.size,Math.max(40,h*.36),Math.max(40,w*.42));',
   "const displaySize=BrawlControlLayoutV1.displaySize(p,w,h,'duel');",modeName+' render size');
  html=replaceOnce(html,
   'const x=clamp(p.x*w,displaySize/2+4,w-displaySize/2-4);\n      const y=clamp(p.y*h,displaySize/2+4,h-displaySize/2-4);',
   'const {x,y}=BrawlControlLayoutV1.center(p,w,h,displaySize);',modeName+' render center');
  html=replaceOnce(html,
   'const size=Math.min(p.size,Math.max(40,rect.height*.36),Math.max(40,rect.width*.42));',
   "const size=BrawlControlLayoutV1.displaySize(p,rect.width,rect.height,'duel');",modeName+' drag size');
  html=replaceOnce(html,
   'p.x=clamp((e.clientX-rect.left)/rect.width,(size/2+4)/rect.width,1-(size/2+4)/rect.width);\n    p.y=clamp((e.clientY-rect.top)/rect.height,(size/2+4)/rect.height,1-(size/2+4)/rect.height);',
   'Object.assign(p,BrawlControlLayoutV1.dragPoint(e,rect,size));',modeName+' drag coordinate');
 }else{
  html=replaceOnce(html,
   'layout[k]={x:clamp(Number(v[k].x)||layoutDefault[k].x,.07,.93),y:clamp(Number(v[k].y)||layoutDefault[k].y,.12,.91),size:clamp(Number(v[k].size)||layoutDefault[k].size,44,100)}',
   "layout[k]=BrawlControlLayoutV1.restorePoint(v[k],layoutDefault[k],'squad')",modeName+' squad saved settings');
  if(modeName==='draft.2vs2')html=replaceOnce(html,
   'layout.gad2={x:clamp(saved.x,.07,.93),y:clamp(saved.y,.12,.91),size:clamp(saved.size,44,100)};',
   "layout.gad2=BrawlControlLayoutV1.restorePoint(saved,layoutDefault.gad2,'squad-gad2');",modeName+' gad2 settings');
  html=replaceOnce(html,
   "const size=Math.min(p.size,Math.max(30,Math.min(sw,sh)*.30));el.style.width=size+'px';el.style.height=size+'px';el.style.left=clamp(p.x*sw,size/2+4,sw-size/2-4)+'px';el.style.top=clamp(p.y*sh,size/2+4,sh-size/2-4)+'px';",
   "const size=BrawlControlLayoutV1.displaySize(p,sw,sh,'squad'),{x,y}=BrawlControlLayoutV1.center(p,sw,sh,size);el.style.width=size+'px';el.style.height=size+'px';el.style.left=x+'px';el.style.top=y+'px';",
   modeName+' mock action positions');
  html=replaceOnce(html,
   "sz=Math.min(p.size,Math.max(30,Math.min(sw,sh)*.30));e.style.width=sz+'px';e.style.height=sz+'px';e.style.left=clamp(p.x*sw,sz/2+4,sw-sz/2-4)+'px';e.style.top=clamp(p.y*sh,sz/2+4,sh-sz/2-4)+'px';",
   "sz=BrawlControlLayoutV1.displaySize(p,sw,sh,'squad'),{x,y}=BrawlControlLayoutV1.center(p,sw,sh,sz);e.style.width=sz+'px';e.style.height=sz+'px';e.style.left=x+'px';e.style.top=y+'px';",
   modeName+' live action positions');
  html=replaceOnce(html,
   'layout[k].x=clamp((ev.clientX-stage.left)/stage.width,(sz/2+4)/stage.width,1-(sz/2+4)/stage.width);\n layout[k].y=clamp((ev.clientY-stage.top)/stage.height,(sz/2+4)/stage.height,1-(sz/2+4)/stage.height);applyLayout();',
   'Object.assign(layout[k],BrawlControlLayoutV1.dragPoint(ev,stage,sz));applyLayout();',
   modeName+' mock drag positions');
  if(modeName==='draft.2vs2'){
   html=replaceOnce(html,
    "const size=Math.min(p.size,Math.max(30,Math.min(sw,sh)*.30));\n b.style.width=size+'px';b.style.height=size+'px';",
    "const size=BrawlControlLayoutV1.displaySize(p,sw,sh,'squad');\n  b.style.width=size+'px';b.style.height=size+'px';",
    modeName+' gad2 size');
   html=replaceOnce(html,
    "b.style.left=clamp(p.x*sw,size/2+4,sw-size/2-4)+'px';\n b.style.top=clamp(p.y*sh,size/2+4,sh-size/2-4)+'px';",
    "const {x,y}=BrawlControlLayoutV1.center(p,sw,sh,size);\n  b.style.left=x+'px';\n  b.style.top=y+'px';",
    modeName+' gad2 position');
  }
 }
 return html;
}


const SQUAD_NETWORK_PARTS=[
 ['squadPresencePositions','async function registerPresence()','function attachRoom()'],
 ['squadActionStream','function acceptAction(a,localPrediction=false)','// Up to six simultaneous friend actions'],
 ['squadHostActions','async function processHostQueue()','function projectileStep(']
];
function patchSquadNetwork(html,parts){
 for(const [key,start,end] of SQUAD_NETWORK_PARTS){
  const canonical=parts[key];
  assert(typeof canonical==='string'&&canonical.startsWith(start)&&canonical.endsWith('\n'),
    'invalid squad network module '+key);
  const span=uniqueSpan(html,start,end,key);
  html=html.slice(0,span.begin)+canonical+html.slice(span.stop);
 }
 return html;
}

const SQUAD_PRESENTATION_NAMES=[
 'processCombatTick','sendPositionNow','remotePresentationTarget',
 'reconcileHpPreviews','previewOwnBulletHit','renderCombatEvents'
];
// Move only 6 exact legacy function definitions, never the V3 network blocks.
// All mutations are to generated staging HTML; canonical candidate inputs
// and production URLs/rules stay byte-for-byte unchanged.
function squadPresentationBlocks(source){
 const rx=/\/\* BEGIN SHARED PRESENTATION ([A-Za-z][A-Za-z0-9]*) \*\/\n([\s\S]*?)\n\/\* END SHARED PRESENTATION \1 \*\//g;
 const matches=[...source.matchAll(rx)];
 assert.deepEqual(matches.map(m=>m[1]),SQUAD_PRESENTATION_NAMES,'exactly six named shared presentation functions');
 return matches.map(m=>{
  const name=m[1],body=m[2];
  assert(new RegExp('(?:async\\s+)?function\\s+'+name+'\\s*\\(').test(body),'invalid shared function '+name);
  return {name,body};
 });
}
function patchSquadPresentation(html,source,modeName){
 assert(!html.includes('BEGIN GENERATED SHARED 2V2 PRESENTATION'),'already injected: '+modeName);
 const incoming=squadPresentationBlocks(source);
 // Always remove the pinned ORIGINAL functions, not their future edited form.
 // This permits a canonical code change to affect both generated 2v2 outputs
 // without modifying or repinning the preserved friend candidate HTML files.
 const parts=squadPresentationBlocks(read(spec.modules.squadCombatPresentation));
 assert.deepEqual(incoming.map(x=>x.name),parts.map(x=>x.name),'six unchanged function identities');
 for(const part of parts){
  if(!html.includes(part.body)){
   const start=html.indexOf((part.name==='processCombatTick'?'async ':'')+'function '+part.name+'(');
   const sample=start<0?'':html.slice(start,start+part.body.length);
   let at=0;while(at<sample.length&&sample[at]===part.body[at])at++;
   throw Error('V3.2 shared function drift '+modeName+'/'+part.name+
    ' at='+at+' originalPos='+start+' expected='+JSON.stringify(part.body.slice(Math.max(0,at-55),at+95))+
    ' actual='+JSON.stringify(sample.slice(Math.max(0,at-55),at+95)));
  }
  html=replaceOnce(html,part.body,'',modeName+' remove legacy '+part.name);
 }
 const marker='const layoutDefault={gad:';
 return replaceOnce(html,marker,
  '/* BEGIN GENERATED SHARED 2V2 PRESENTATION */\n'+source.trimEnd()+
  '\n/* END GENERATED SHARED 2V2 PRESENTATION */\n'+marker,
  modeName+' inject 2v2 presentation');
}

// Google Sites normal 2v2 should join with a 5-digit code, just like draft
// 2v2. Keep the existing editable advanced endpoint field for local emulators,
// but prefill the USER-CONFIRMED Firebase RTDB instead of requiring every iPad
// to configure it. Applies ONLY to the generated normal 2v2 staging HTML.
function patchNormalSquadRoomEntry(html){
 const endpoint='https://mygame-df915-default-rtdb.firebaseio.com/';
 html=replaceOnce(html,"const value=(el?.value||''||stored).trim();",
   "const value=(el?.value||stored||'"+endpoint+"').trim();",'normal 2v2 endpoint get');
 html=replaceOnce(html,"el.value=''||stored;",
   "el.value=stored||'"+endpoint+"';",'normal 2v2 endpoint prefill');
 html=replaceOnce(html,
   '接続先を入力後にルーム作成・参加。設定はブラウザ内だけに保存されます。',
   'ルーム番号だけで参加できます。接続先設定は通常不要です。',
   'normal 2v2 endpoint note');
 html=replaceOnce(html,
   'オンライン開発検証版。安全な隔離Firebaseのテスト環境専用。まだ公開しないでください。',
   '友達とのオンライン対戦。5桁のルーム番号で参加できます。',
   'normal 2v2 public-facing description');
 return html;
}

const FRIEND_INPUT_SPANS={
 duelPointerAim:{start:'  function pcPointer(e){',end:'\n\n\n  function alertStatus(',modes:['normal.1vs1','draft.1vs1']},
 squadPointerAim:{start:'function pcPointer(e){',end:'let pcShot=null;',modes:['normal.2vs2','draft.2vs2']},
 squadInputTiming:{start:'function inputEventQueueDelay(e,enteredAt=performance.now()){',end:'let inputTiming=',modes:['normal.2vs2','draft.2vs2']},
 squadCollisionMovement:{start:'function moveWithWall(dx,dy){',end:'// Only active motion needs the 80ms network cadence.',modes:['normal.2vs2','draft.2vs2']},
 duelTouchHandlers:{start:'  function pointerDown(e) {',end:'  function bindUltimateButton(){',modes:['normal.1vs1','draft.1vs1']},
 duelActionButtons:{start:'  function bindUltimateButton(){',end:'  function soloDebug(',modes:['normal.1vs1','draft.1vs1']},
 squadTouchHandlers:{start:"canvas.addEventListener('pointerdown'",end:'// Touch/pen triggers on pointerdown:',modes:['normal.2vs2','draft.2vs2']},
 squadCombatAim:{start:'function enemyCandidate(){',end:'function boundedRemember(set,id){',modes:['normal.2vs2','draft.2vs2']},
 squadTouchPaint:{start:'function recordFirstTouchCanvasPaint(paintedAt){',end:'let drawTiming=',modes:['normal.2vs2','draft.2vs2']}
};
// Preserve the original duel vs. squad input profiles. Replace their identical
// function spans IN PLACE in staged HTML; unlike older shared presentation work,
// no function is hoisted across script/lexical scopes or event registration.
function patchFriendInputs(html,modeName,overrides=null){
 const mode=spec.modes[modeName];
 assert(mode,'unknown friend input mode: '+modeName);
 for(const [key,rule] of Object.entries(FRIEND_INPUT_SPANS)){
  const enabled=mode.modules.includes(key);
  assert.equal(enabled,rule.modes.includes(modeName),'wrong input mode '+modeName+'/'+key);
  if(!enabled)continue;
  const canonical=overrides?.[key]??read(spec.modules[key]);
  assert(canonical.startsWith(rule.start),'friend input source beginning drift '+key);
  assert(!canonical.includes(rule.end),'friend input source overlaps next block '+key);
  const span=uniqueSpan(html,rule.start,rule.end,modeName+'/'+key);
  html=html.slice(0,span.begin)+canonical+html.slice(span.stop);
 }
 return html;
}

// Opt-in read-only probe is appended after all game state declarations, just
// before the existing QA hooks. No timers are armed unless start() is called.
function patchSquadLatencyProbe(html,source,modeName){
 assert(source.includes('window.__brawlLatencyV35QA=Object.freeze('),
   'latency probe API missing');
 assert(!source.includes('</script>'),'probe must remain in the existing script');
 assert(!html.includes('window.__brawlLatencyV35QA'),'probe already inserted '+modeName);
 return replaceOnce(html,'window.__brawlEarlyShotsQA=()=>',
   source.trimEnd()+'\nwindow.__brawlEarlyShotsQA=()=>',
   modeName+' insert optional V3.5 instrumentation');
}
// Opt-in local timing only, generated into two STAGING 2v2 HTMLs.
// A stage may hold an action ID transiently but exports ONLY aggregate samples.
// This instrumentation NEVER changes Firebase or the authoritative reducer.
function patchSquadActionLagProbe(html,source,modeName){
 assert(source.includes('window.__brawlLagV39QA=Object.freeze('),'V3.9 latency API missing');
 assert(!source.includes('</script>')&&!html.includes('window.__brawlLagV39QA'),
   'V3.9 probe cannot be inserted twice '+modeName);
 html=replaceOnce(html,'window.__brawlEarlyShotsQA=()=>',
   source.trimEnd()+'\nwindow.__brawlEarlyShotsQA=()=>',
   modeName+' V3.9 opt-in recorder');
 const change=(before,after,label)=>{html=replaceOnce(html,before,after,modeName+' V3.9 '+label);};
 change(
  "pendingActions.set(a.eventId,{action:a,networkSeen:!!old?.networkSeen||!localPrediction});",
  "pendingActions.set(a.eventId,{action:a,networkSeen:!!old?.networkSeen||!localPrediction});\n if(!localPrediction&&a.type==='shot'&&a.owner!==myId)\n  window.__brawlLagV39QA.tap('receive',a,serverNow()-a.at);",
  'incoming shot');
 change(
  'boundedRemember(queuedActions,id);hostQueue.push(a);',
  "boundedRemember(queuedActions,id);hostQueue.push(a);window.__brawlLagV39QA.tap('hostQueued',a);",
  'host queue staging timestamp');
 change(
  "const roomKey=room.key,owner=myId,ref=room.child('actions').push(),a={...action,eventId:ref.key};",
  "const roomKey=room.key,owner=myId,ref=room.child('actions').push(),a={...action,eventId:ref.key};\n if(a.type==='shot')window.__brawlLagV39QA.tap('send',a);",
  'local shot start');
 change(
  "ref.set(action).then(()=>{\n  localPendingWrites.delete(a.eventId);",
  "ref.set(action).then(()=>{\n  if(a.type==='shot')window.__brawlLagV39QA.tap('ack',a);\n  localPendingWrites.delete(a.eventId);",
  'Firebase write ack');
 change(
  "}).catch(e=>{\n  localPendingWrites.delete(a.eventId);",
  "}).catch(e=>{\n  if(a.type==='shot')window.__brawlLagV39QA.tap('failed',a);\n  localPendingWrites.delete(a.eventId);",
  'Firebase write failed');
 change(
  "const input=inputSnapshot();\n   const result=await activeRoom.child('game').transaction(g=>{",
  "const input=inputSnapshot();\n   const __v39TxnAt=performance.now();\n   for(const __a of activeBatch)window.__brawlLagV39QA.tap('hostBegin',__a);\n   const result=await activeRoom.child('game').transaction(g=>{",
  'host transaction start');
 change(
  "},undefined,false);\n   if(!result.committed){",
  "},undefined,false);\n   window.__brawlLagV39QA.tap('hostTxn',null,{durationMs:performance.now()-__v39TxnAt,committed:result.committed});\n   if(!result.committed){",
  'host transaction result');
 change(
  'game=snap.val();reconcileHpPreviews(before,game);',
  'game=snap.val();window.__brawlLagV39QA.snapshot(game);reconcileHpPreviews(before,game);',
  'authoritative snapshot');
 change(
  'const pos=earlyBomberPoint(a,age);\n   ctx.fillStyle=',
  "const pos=earlyBomberPoint(a,age);\n   window.__brawlLagV39QA.tap('visual',a);\n   ctx.fillStyle=",
  'early bomber visual');
 change(
  "ctx.beginPath();ctx.arc(pt.x,pt.y,p.char==='sniper'?6:4,0,Math.PI*2);ctx.stroke();",
  "window.__brawlLagV39QA.tap('visual',a);\n   ctx.beginPath();ctx.arc(pt.x,pt.y,p.char==='sniper'?6:4,0,Math.PI*2);ctx.stroke();",
  'early bullet visual');
 change(
  'const previous=bulletVisuals.get(bullet.id);',
  "const previous=bulletVisuals.get(bullet.id);\n   if(!previous&&bullet.owner!==myId&&bullet.fireId)\n    window.__brawlLagV39QA.tap('visual',{eventId:bullet.fireId});",
  'authoritative projectile visual');
 return html;
}

// V4.0 has no gameplay side effects. Install after the V3.9 timing API,
// before QA exports; game initialization and Firebase protocol are untouched.
function patchSquadLagPanelV40(html,source,modeName){
 assert(html.includes('window.__brawlLagV39QA=Object.freeze('),
  'V4.0 requires V3.9 measurement in '+modeName);
 assert(source.includes('window.__brawlLagV40UI=Object.freeze('),
  'missing V4.0 touch UI API');
 assert(!source.includes('</script>')&&!html.includes('window.__brawlLagV40UI'),
  'V4.0 UI cannot be inserted twice '+modeName);
 return replaceOnce(html,'window.__brawlEarlyShotsQA=()=>',
  source.trimEnd()+'\nwindow.__brawlEarlyShotsQA=()=>',
  modeName+' iPad V4.0 opt-in diagnostics UI');
}

// V4.4: keep Firebase RTDB, but use child deltas after a single bootstrap.
// The published/immutable HTML inputs are never rewritten by this transform.
function patchSquadPositionDeltaV44(html,canonical,modeName){
 assert(canonical.includes('function subscribeSquadPositionDeltas(')&&
  canonical.includes('window.__brawlPositionV44QA='),
  'missing V4.4 selective position subscriber');
 assert(!canonical.includes('</script>'),'unsafe V4.4 inline source');
 assert(!html.includes('window.__brawlPositionV44QA'),'V4.4 already staged '+modeName);
 const legacy="watch(room.child('positions'),'value',snap=>{const started=performance.now();presentationMetrics.positionSnapshots++;rawPositions=snap.val()||{};positionsReady=true;ingestPositions();reconcileRoomView('positions');workTiming.positionSnapshots++;workTiming.positionSnapshotTotalMs+=performance.now()-started;});";
 html=replaceOnce(html,'function attachRoom(){',
  canonical.trimEnd()+'\nfunction attachRoom(){',modeName+' install V4.4 listener');
 return replaceOnce(html,legacy,
  "subscribeSquadPositionDeltas(room.child('positions'),thisRoom,generation);",
  modeName+' incremental positions instead of value listener');
}

// V4.5: keep source 2v2 candidate files frozen; coalesce only the expensive
// active-match HUD calculation, not authoritative snapshots or UI transitions.
function patchSquadHudV45(html,canonical,modeName){
 assert(canonical.includes('function requestGameHudRefreshV45(')&&
  canonical.includes('function renderGameHUD(){')&&
  canonical.includes('window.__brawlHudV45QA='),
  'V4.5 shared HUD module missing entry points');
 assert(!canonical.includes('</script>'),'unsafe inline V4.5 source');
 assert(!html.includes('__brawlHudV45QA'),'HUD already patched '+modeName);
 html=replaceOnce(html,'function renderGameHUD(){',
  'function renderGameHUDV45Base(){',modeName+' extract original HUD render');
 html=replaceOnce(html,"function reconcileRoomView(source='state'){",
  canonical.trimEnd()+"\nfunction reconcileRoomView(source='state'){",
  modeName+' V4.5 shared code injection');
 return replaceOnce(html,'checkPaused();renderGameHUD();',
  "checkPaused();requestGameHudRefreshV45(enteredGame||game.phase!=='playing'||paused);",
  modeName+' defer normal-active game HUD to animation frame');
}

function sharedSection(html,name){
 const begin='BEGIN SHARED '+name,end='END SHARED '+name;
 const span=uniqueSpan(html,begin,end,name);
 return html.slice(span.begin,span.stop);
}
function validate(html,modeName,mode){
 assert(html.startsWith('<!DOCTYPE html>')||html.startsWith('<!doctype html>'),'doctype '+modeName);
 const protocol=new RegExp('(?:PROTOCOL\\s*=\\s*)'+mode.protocol+'(?!\\d)');
 assert(protocol.test(html),'protocol contract '+modeName);
 if(mode.roomRoot==='rooms2v2')assert(html.includes("ROOT='rooms2v2'"),'squad RTDB root '+modeName);
 else assert(html.includes("rooms/'+code"),'duel RTDB root '+modeName);
 assert(!html.includes("db.useEmulator("),'emulator code forbidden in standalone output '+modeName);
 assert(!/<script\b[^>]*\bsrc\s*=/.test(html),'remote script dependency '+modeName);
 assert(html.includes("script-src 'unsafe-inline'"),'strict inline CSP '+modeName);
 const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)];
 assert(scripts.length>=1,'inline script missing '+modeName);
 scripts.forEach((m,i)=>{if(m[1].trim())new vm.Script(m[1],{filename:modeName+'#'+i});});
 assert(html.includes('window.__brawlV3QA')||html.includes('window.__brawlV29QA'),'QA hook '+modeName);
 return true;
}
// V4.8: ACTION preview can exist before the host snapshot has a projectile.
// Quiet KO / HOT ZONE may otherwise skip the Canvas even though a visible
// remote bullet is waiting to be drawn. Apply to STAGING 2vs2 only.
function patchSquadQuietEarlyShotWakeV48(html,modeName){
 const anchor='function quietCanvasIdleEligible(){\n';
 assert(!html.includes('/* V4.8 remote action Canvas wake */'),
  'V4.8 wake may only be inserted once '+modeName);
 assert(html.includes('const earlyShots=new Map(),earlyBombSmoothing=new Map();'),
  'V4.8 needs shared early-shot maps '+modeName);
 return replaceOnce(html,anchor,anchor+
  ' /* V4.8 remote action Canvas wake */\n'+
  ' if(earlyShots.size||earlyBombSmoothing.size)return false;\n',
  modeName+' idle Canvas remote shot wake');
}
// V5.2 opt-in STAGING-only 1vs1 renderer guard. Original published HTML and
// the 2vs2 engines are deliberately unchanged; no network/combat state edits.
function patchDuelFrameStabilityV52(html,modeName){
 assert(['normal.1vs1','draft.1vs1'].includes(modeName),'V5.2 only for duel staging');
 assert(!html.includes('/* V5.2 1vs1 warp guard */'),'duplicate V5.2 guard');
 html=replaceOnce(html,
  '    if(gap>125){remote.x=target.x;remote.y=target.y;}\n    else{remote.x+=(target.x-remote.x)*smoothing;remote.y+=(target.y-remote.y)*smoothing;}',
  '    /* V5.2 1vs1 warp guard */\n'+
  '    // A delayed position packet must not teleport a walking opponent.\n'+
  '    // Keep intentional dash/jump correction immediate. Combat targets remain authoritative.\n'+
  '    if(gap>125&&(remote.dash>0||jumping?.actor===remote)){remote.x=target.x;remote.y=target.y;}\n'+
  '    else{remote.x+=(target.x-remote.x)*smoothing;remote.y+=(target.y-remote.y)*smoothing;}',
  modeName+' V5.2 remote display warp');
 html=replaceOnce(html,
  '    canvas.width=Math.max(1,Math.round(sw*dpr));canvas.height=Math.max(1,Math.round(sh*dpr));',
  '    // iPad Safari may fire window resize and ResizeObserver for one layout update.\n'+
  '    // Setting the same Canvas dimensions still clears and reallocates its backing store.\n'+
  '    const bw=Math.max(1,Math.round(sw*dpr)),bh=Math.max(1,Math.round(sh*dpr));\n'+
  '    if(canvas.width!==bw)canvas.width=bw;\n'+
  '    if(canvas.height!==bh)canvas.height=bh;',
  modeName+' V5.2 Canvas no-op resize');
 return html;
}
function makeAll(moduleOverride=null,positionOverride=null,presentationOverride=null,friendInputOverrides=null,latencyProbeOverride=null,includeV39=true,includeV44=includeV39,includeV45=false,includeV48=true){
 assert.equal(spec.schemaVersion,1);
 const canonical=moduleOverride===null?read(spec.modules.squadEarlyShots):moduleOverride;
 const projectileSource=read(spec.modules.squadProjectileVisual);
 assert(canonical.startsWith(ACTION_BEGIN)&&canonical.endsWith('\n'),'bad shared early-shot source');
 assert(!canonical.includes(ACTION_END),'source must not contain marker after block');
 const layoutSource=read(spec.modules.controlLayout);
 const positionSource=positionOverride===null?read(spec.modules.squadPositionPublish):positionOverride;
 assert(positionSource.startsWith(POSITION_BEGIN)&&positionSource.endsWith('\n'),
   'invalid 2v2 position policy source');
 assert(!positionSource.includes(POSITION_END),'position policy overlaps next function');
 const squadNetwork=Object.fromEntries(SQUAD_NETWORK_PARTS.map(([key])=>[key,read(spec.modules[key])]));
 const presentationSource=presentationOverride===null?read(spec.modules.squadCombatPresentation):presentationOverride;
 const latencyProbeSource=latencyProbeOverride===null?read(spec.modules.squadLatencyProbe):latencyProbeOverride;
 const lagStageSource=read(spec.modules.squadActionLagProbeV39);
 const lagPanelSource=read(spec.modules.squadLagPanelV40);
 const deltaPositionSource=read(spec.modules.squadPositionDeltaV44);
 const hudV45Source=read(spec.modules.squadHudV45);
 const outputs={};
 for(const [name,mode] of Object.entries(spec.modes)){
  let html=read(mode.source);
  if(mode.modules.includes('squadEarlyShots'))html=patchEarlyShots(html,canonical);
  if(mode.modules.includes('squadProjectileVisual'))html=patchSquadProjectileVisual(html,projectileSource);
  if(mode.modules.includes('squadPositionPublish'))html=patchPositionPublish(html,positionSource);
  if(mode.modules.includes('controlLayout'))html=patchControlLayout(html,layoutSource,name);
  if(mode.modules.includes('squadActionStream')){
   assert(SQUAD_NETWORK_PARTS.every(([key])=>mode.modules.includes(key)),'incomplete network module set '+name);
   html=patchSquadNetwork(html,squadNetwork);
  }
  if(mode.modules.includes('squadCombatPresentation')){
   assert(mode.modules.includes('squadHostActions'),'presentation only after V3 2v2 network: '+name);
   html=patchSquadPresentation(html,presentationSource,name);
  }
  html=patchFriendInputs(html,name,friendInputOverrides);
  if(name.endsWith('.1vs1'))html=patchDuelFrameStabilityV52(html,name);
  if(mode.modules.includes('squadLatencyProbe')){
   assert(mode.roomRoot==='rooms2v2','no 1v1 probe leak '+name);
   html=patchSquadLatencyProbe(html,latencyProbeSource,name);
  }
  if(includeV39&&mode.modules.includes('squadActionLagProbeV39')){
   assert(mode.roomRoot==='rooms2v2'&&mode.modules.includes('squadLatencyProbe'),'V3.9 requires 2v2 V3.5 sampler');
   html=patchSquadActionLagProbe(html,lagStageSource,name);
  }
  if(includeV39&&mode.modules.includes('squadLagPanelV40')){
   assert(mode.modules.includes('squadActionLagProbeV39'),'V4.0 UI requires V3.9 timing API');
   html=patchSquadLagPanelV40(html,lagPanelSource,name);
  }
  if(includeV44&&mode.modules.includes('squadPositionDeltaV44')){
   assert(mode.modules.includes('squadPresencePositions')&&mode.roomRoot==='rooms2v2','V4.4 only applies to 2v2 network');
   html=patchSquadPositionDeltaV44(html,deltaPositionSource,name);
  }
  if(includeV45&&mode.modules.includes('squadHudV45')){
   assert(mode.roomRoot==='rooms2v2'&&mode.modules.includes('squadCombatPresentation'),
    'V4.5 only applies to 2v2 presentation');
   html=patchSquadHudV45(html,hudV45Source,name);
  }
  if(includeV48&&mode.modules.includes('squadEarlyShots'))html=patchSquadQuietEarlyShotWakeV48(html,name);
  if(name==='normal.2vs2')html=patchNormalSquadRoomEntry(html);
  validate(html,name,mode);
  outputs[name]={mode,html,hash:crypto.createHash('sha256').update(html).digest('hex')};
 }
 const entries=Object.values(outputs).map(o=>o.html);
 for(const type of ['WEAPON RULES','PROJECTILE PHYSICS','ABILITIES']){
  const base=sharedSection(entries[0],type);
  for(let i=1;i<entries.length;i++)assert.equal(sharedSection(entries[i],type),base,'cross-mode '+type+' drift');
 }
 assert.equal(Object.keys(outputs).length,4,'exactly four modes required');
 return outputs;
}
function safeTarget(rel){
 assert(rel.startsWith(safeOutputPrefix),'staging output must remain under artifacts/friends-online');
 assert(!rel.includes('..')&&!path.isAbsolute(rel),'unsafe output path');
 const target=path.resolve(root,rel);
 assert(target.startsWith(path.resolve(root,'artifacts/friends-online')+path.sep),'write escaped staging root');
 return target;
}
function main(flag){
 assert(['--check','--emit','--sync'].includes(flag),'use --check, --emit or --sync');
 const output=makeAll();
 for(const [name,data] of Object.entries(output)){
  const {mode,html,hash}=data,original=read(mode.source);
  if(flag==='--check'){
   const gitBlob=crypto.createHash('sha1').update('blob '+Buffer.byteLength(original)+'\0'+original).digest('hex');
   assert.equal(gitBlob,mode.sourceGitBlob,'unreviewed candidate source drift: '+name+'; update manifest snapshot after review');
   // Candidate source is deliberately frozen and pinned by sourceGitBlob.
   // Shared runtime improvements belong to generated staging, not to the
   // immutable input HTML. Validate the patch can be applied without forcing
   // the old candidate to equal the newest shared visual implementation.
   if(mode.modules.includes('squadEarlyShots')){
    const updated=patchEarlyShots(original,read(spec.modules.squadEarlyShots));
    assert(updated.includes(read(spec.modules.squadEarlyShots).trimEnd()),
      '2v2 staged early-shot patch did not apply: '+name);
   }
   if(mode.modules.includes('squadActionStream'))
    for(const [key,start,end] of SQUAD_NETWORK_PARTS){
     const p=uniqueSpan(original,start,end,key);
     // The immutable input HTML is pinned separately. Future fixes change only
     // shared/runtime, and are automatically emitted into BOTH 2v2 builds.
     const legacy=original.slice(p.begin,p.stop);
     const legacyBlob=crypto.createHash('sha1').update('blob '+Buffer.byteLength(legacy)+'\0'+legacy).digest('hex');
     assert.equal(legacyBlob,spec.legacySquadNetworkBlobs[key],
      'original 2v2 network baseline modified '+name+' / '+key);
    }
   if(mode.modules.includes('squadPositionPublish'))
    assert.equal(patchPositionPublish(original,read(spec.modules.squadPositionPublish)),original,
      '2v2 candidate has stale position policy: '+name);
   if(mode.modules.includes('squadCombatPresentation'))
    for(const {name:fn,body} of squadPresentationBlocks(read(spec.modules.squadCombatPresentation)))
     assert.equal(original.split(body).length-1,1,'unchanged legacy function '+name+'/'+fn);
   assert(html.includes('BrawlControlLayoutV1'),'control module must be inlined for '+name);
   console.log('PASS '+name+' canonical source and standalone ('+hash.slice(0,12)+')');
  }else if(flag==='--emit'){
   const dest=safeTarget(mode.output);fs.mkdirSync(path.dirname(dest),{recursive:true});
   fs.writeFileSync(dest,html);console.log('EMIT '+name+' '+mode.output+' sha256='+hash);
  }else if(flag==='--sync'){
   // Source files are output candidates ONLY. Public baseline and 1v1 remain frozen.
   if(!mode.modules.includes('squadEarlyShots'))continue;
   assert(mode.source.endsWith('_LATENCY_CANDIDATE.html'),'sync may update only two latency candidates');
   assert(!spec.forbiddenWritePrefixes.includes(mode.source),'public release blocked');
   const sourceSynced=patchEarlyShots(original,read(spec.modules.squadEarlyShots));
   fs.writeFileSync(path.join(root,mode.source),sourceSynced);
   console.log('SYNC shared early-shot only (no UI migration) -> '+mode.source);
  }
 }
 if(flag==='--check')console.log('PASS four-mode reproducible standalone friends foundation, no public writes');
 if(flag==='--emit')console.log('PASS four standalone Google Sites copy-ready HTMLs; publication is always manual');
}
if(require.main===module)main(process.argv[2]);
module.exports={spec,makeAll,validate,patchEarlyShots,patchPositionPublish,patchControlLayout,patchSquadNetwork,SQUAD_NETWORK_PARTS,patchSquadPresentation,squadPresentationBlocks,SQUAD_PRESENTATION_NAMES,FRIEND_INPUT_SPANS,patchFriendInputs,patchSquadLatencyProbe,patchSquadActionLagProbe,patchSquadLagPanelV40,patchSquadPositionDeltaV44,patchSquadHudV45,patchSquadQuietEarlyShotWakeV48,patchDuelFrameStabilityV52,sharedSection,safeTarget,main};
