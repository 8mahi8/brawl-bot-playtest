// Pure trusted BRAWL 2v2 prototype unit tests — no Firebase and no browser.
'use strict';
const assert=require('node:assert/strict');
const {WORLD,makeMatch,applyIntent,clientSummary}=require('../draft/trusted-match-core.cjs');
const ids={blue1:'alice0001',blue2:'alice0002',red1:'bob00001',red2:'bob00002'};
const start=100000;
const initial=()=>makeMatch(ids,'match-000001',start);
const command=(type,seq=1,extra={})=>({type,seq,matchId:'match-000001',
 round:1,life:0,connectionId:'conn-alice001',at:start+600,
 x:1900,y:900,angle:0,reach:300,...extra});
const run=(state,uid,intent,now=start+600,conn='conn-alice001',actionId='action-0001')=>
 applyIntent({state,uid,actionId,intent,connectionId:conn,now});
const expectRejected=(state,intent,reason)=>{const before=JSON.stringify(state);
 const out=run(state,ids.blue1,intent);assert.equal(out.accepted,false,reason);
 assert.equal(JSON.stringify(state),before,'rejected intent must not mutate authoritative state');};
const game=initial();
assert.equal(game.players[ids.blue1].team,'blue');
assert.equal(game.players[ids.red1].team,'red');
const copy=JSON.stringify(game);
let res=run(game,ids.blue1,command('shot'));
assert(res.accepted&&res.events.some(x=>x.type==='hit'&&x.victim===ids.red1));
assert.equal(res.state.hp[ids.red1],150);
assert.equal(JSON.stringify(game),copy,'pure reducer does not mutate previous game state');
assert.equal(res.state.players[ids.blue1].x,500,'forged client x ignored for collision');
assert.equal(res.state.players[ids.blue1].y,420,'forged client y ignored for collision');
assert.equal(res.state.hp[ids.blue2],160,'teammate immune to normal friendly shot');
assert.deepEqual(Object.keys(clientSummary(res.state)).sort(),
 ['matchId','phase','revision','round','score','winner'].sort(),'public never leaks raw positions or private HP');
expectRejected(game,command('gadget'), 'unsupported GAD is not processed as ordinary hit');
expectRejected(game,command('shot',1,{round:2}),'round mismatch');
expectRejected(game,command('shot',1,{life:4}),'life mismatch');
expectRejected(game,command('shot',1,{connectionId:'stolen-conn'}),'token mismatch');
expectRejected(game,command('shot',1,{at:start-20000}),'stale client clock');
expectRejected(game,command('shot',33),'out of allowed sequence window');
expectRejected(game,command('move',1,{dx:2,dy:0}),'movement vector exceeds unit speed');
let walking=run(game,ids.blue1,command('move',1,{dx:1,dy:0}),start+600);
assert(walking.accepted);assert.equal(walking.state.players[ids.blue1].x,530,
 'server limits one move to 120ms at .25px/ms regardless of client position');
assert.equal(walking.state.players[ids.blue1].y,420);
const walking2=run(walking.state,ids.blue1,command('move',2,{dx:1,dy:0,at:start+605}),start+605);
assert(walking2.accepted);
assert(Math.abs(walking2.state.players[ids.blue1].x-531.25)<1e-9);
expectRejected(walking2.state,command('move',2,{dx:1,dy:0}),'replay cannot duplicate move');
const withWall=initial();
withWall.walls=[{x:575,y:400,w:25,h:40}];
const wallShot=run(withWall,ids.blue1,command('shot'));
assert(wallShot.accepted&&wallShot.events.some(e=>e.type==='miss'));
assert.equal(wallShot.state.hp[ids.red1],160,'solid wall prevents normal hit');
const blockedMove=initial();
blockedMove.walls=[{x:510,y:400,w:50,h:50}];
assert.equal(run(blockedMove,ids.blue1,command('move',1,{dx:1,dy:0})).state.players[ids.blue1].x,500,
 'a server obstacle blocks movement');
const cooling=run(res.state,ids.blue1,command('shot',2,{at:start+750}),start+750);
assert.equal(cooling.accepted,false);
assert.equal(cooling.reason,'cooldown_or_ammo');
let ko=initial();ko.hp[ids.red1]=10;ko.hp[ids.red2]=10;
let first=run(ko,ids.blue1,command('shot'),start+600);
assert(first.accepted&&first.state.hp[ids.red1]===0&&first.state.phase==='playing');
const second=run(first.state,ids.blue2,{...command('shot'),connectionId:'conn-alice002',
 at:start+1000},start+1000,'conn-alice002','action-0002');
assert(second.accepted);
assert.equal(second.state.hp[ids.red2],0);
assert.equal(second.state.phase,'round_end');
assert.equal(second.state.winner,'blue');
assert.deepEqual(second.state.score,{blue:1,red:0});
const frozen=run(second.state,ids.blue1,command('shot',2,{at:start+1600}),start+1600);
assert(!frozen.accepted&&frozen.reason==='not_playing');
console.log('PASS trusted reducer: server-position hit, wall occlusion, capped velocity, replay/clock/cooldown, no friendly fire, double KO, public projection');
