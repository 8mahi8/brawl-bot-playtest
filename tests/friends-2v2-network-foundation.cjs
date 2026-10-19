// Guard shared 2v2 network semantics: LIVE source = canonical module bytes,
// staged output contains the identical reducer pipeline, and one edit reaches
// normal + draft without affecting duel/production outputs.
'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const {makeAll,spec,SQUAD_NETWORK_PARTS,patchSquadNetwork,validate}=require('../scripts/build-friends-online.cjs');
const built=makeAll(),sources={};
for(const [key,start,end]of SQUAD_NETWORK_PARTS){
 const text=read(spec.modules[key]);sources[key]=text;
 assert(text.startsWith(start)&&text.endsWith('\n'),'complete shared module '+key);
 for(const name of ['normal.2vs2','draft.2vs2']){
  const legacy=read(spec.modes[name].source);
  const first=legacy.indexOf(start),last=legacy.indexOf(end,first+start.length);
  assert(first>=0&&last>first,key+' source anchor '+name);
  assert.equal(legacy.slice(first,last),text,'squad original source parity '+name+' '+key);
  assert(built[name].html.includes(text),'module emitted into '+name+' '+key);
  assert.equal(built[name].html.split(start).length-1,1,'module emitted exactly once '+name+' '+key);
 }
 assert(!built['normal.1vs1'].html.includes(start),'1v1 kept separate '+key);
 assert(!built['draft.1vs1'].html.includes(start),'draft 1v1 kept separate '+key);
}
assert.deepEqual(Object.keys(sources),['squadPresencePositions','squadActionStream','squadHostActions']);
assert(sources.squadActionStream.includes('pendingActions.set(')&&
 sources.squadActionStream.includes('queueMicrotask(')&&
 sources.squadActionStream.includes('localPendingWrites.has(id)')&&
 sources.squadActionStream.includes('validActionReceipt(a,receipt)'),
 'receipt/fast dispatch safety gate retained');
assert(sources.squadHostActions.includes('transaction(g=>')&&
 sources.squadHostActions.includes('HOST_ACTION_BATCH_LIMIT')&&
 sources.squadHostActions.includes('g.hostToken!==token')&&
 sources.squadHostActions.includes('rebuildOnNextPoll()'),
 'authoritative batch transaction and retry retained');
assert(sources.squadPresencePositions.includes('connectionEpoch!==epoch')&&
 sources.squadPresencePositions.includes('p.seq<=prior.seq')&&
 sources.squadPresencePositions.includes('presence[id]?.[p.connectionId]'),
 'presence, lifecycle and stale movement checks retained');
const context={R:18,W:1920,H:1120,game:{matchId:'m',round:3},ACTION_TTL:3000,ACTION_FUTURE:250,
  console,Number,Map,Set};
const check=vm.runInNewContext(sources.squadPresencePositions+
 '\n'+sources.squadActionStream+'\n({validPosition,actionReceipt,validActionReceipt})',context);
const move={matchId:'m',round:3,seq:2,x:400,y:700,a:0,motionRev:1,life:0};
assert(check.validPosition(move),'valid movement packet');
assert(!check.validPosition({...move,x:-1}),'invalid world bounds');
assert(!check.validPosition({...move,seq:-2}),'negative sequence rejected');
assert(!check.validPosition({...move,round:2}),'stale round rejected');
assert(!check.validPosition({...move,motionRev:2.5}),'invalid motion revision rejected');
const shot={owner:'p',seq:11,type:'shot',at:10000};
const receipt=check.actionReceipt(shot,10110);
assert.equal(receipt.acceptedAt,10110,'host time included');
assert(check.validActionReceipt(shot,receipt),'matching accepted receipt');
assert(!check.validActionReceipt(shot,{...receipt,seq:9}),'old seq receipt invalid');
assert(!check.validActionReceipt(shot,{...receipt,acceptedAt:13200}),'replayed / expired action invalid');
assert(!check.validActionReceipt(shot,{...receipt,acceptedAt:9700}),'future action timestamp invalid');
const mutation={...sources,squadActionStream:sources.squadActionStream.replace('localPendingWrites.has(id)','localPendingWrites.has(id /* test marker */)')};
assert.notEqual(mutation.squadActionStream,sources.squadActionStream);
for(const mode of ['normal.2vs2','draft.2vs2']){
 const altered=patchSquadNetwork(built[mode].html,mutation);
 assert(altered.includes('localPendingWrites.has(id /* test marker */)'),'same shared edit emits into '+mode);
 assert(!built[mode].html.includes('/* test marker */'),'unmodified build still exact '+mode);
 validate(altered,mode,built[mode].mode);
}
for(const m of ['normal.1vs1','draft.1vs1'])
 assert(!built[m].html.includes('/* test marker */'),'no shared squad code in '+m);
assert.throws(()=>patchSquadNetwork('',sources),/missing block/);
console.log('PASS 2vs2 shared network: exact normal/draft canonical presence + action dispatch + host batches, monotonic motion, replay-safe receipts, source edits propagate only to both 2v2');
