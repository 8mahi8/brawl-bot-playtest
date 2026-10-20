'use strict';
const fs=require('node:fs'),assert=require('node:assert/strict'),vm=require('node:vm');
const {spec,makeAll}=require('../scripts/build-friends-online.cjs');
const src=fs.readFileSync(spec.modules.squadPresencePositions,'utf8');
const at=src.indexOf('function ingestPositions(changedId=null)');
assert(at>=0,'single changed-player ingestion entry point');
const code=src.slice(at);
assert(!code.includes('function attachRoom('),'only isolated canonical ingestPositions');
assert(!code.includes('.set(')&&!code.includes('.transaction('),'pure client receiver');
const makePos=(seq,round=1)=>({
 x:100+seq,y:200+seq,a:0,seq,round,matchId:'m',
 motionRev:0,life:1,connectionId:'conn'
});
const ctx={
 Map,Math,Object,Number,performance:{now:()=>42},myId:'local',
 game:{matchId:'m',round:1,motions:{},stats:{alpha:{life:1},beta:{life:1}}},
 rawPositions:{alpha:makePos(1),beta:makePos(1)},positions:{},
 positionScope:'',quietCanvasPoseRevision:0,
 remotePositionReceivedAt:new Map(),
 presence:{alpha:{conn:true},beta:{conn:true}},
 playerSeat:id=>['alpha','beta'].includes(id),
 validPosition:p=>{ctx.validated.push(p.x);return p.matchId===ctx.game.matchId&&p.round===ctx.game.round;},
 validated:[]
};
vm.createContext(ctx);vm.runInContext(code,ctx);
vm.runInContext('ingestPositions("alpha")',ctx);
assert.equal(ctx.validated.length,2,'new round/scope must rebuild both positions');
assert.equal(ctx.positions.beta.seq,1);
ctx.validated.length=0;
ctx.rawPositions.alpha=makePos(2);
vm.runInContext('ingestPositions("alpha")',ctx);
assert.deepEqual(ctx.validated,[102],'single changed player validated, no 4-person scan');
assert.equal(ctx.positions.alpha.seq,2);
assert.equal(ctx.positions.beta.seq,1,'other player unchanged');
ctx.validated.length=0;
vm.runInContext('ingestPositions()',ctx);
assert.equal(ctx.validated.length,2,'presence/lobby reconciles every player');
ctx.game.round=2;
ctx.rawPositions.alpha=makePos(1,2);ctx.rawPositions.beta=makePos(1,2);
ctx.validated.length=0;
vm.runInContext('ingestPositions("alpha")',ctx);
assert.equal(ctx.validated.length,2,'round change rebuild includes ALL players');
assert.equal(ctx.positions.beta.round,2);
for(const name of ['normal.2vs2','draft.2vs2'])
 assert(makeAll()[name].html.includes(code.trimEnd()),
  'generated '+name+' uses canonical changed-player ingestion');
console.log('PASS V4.4 one-player reconciliation, full resume/lobby reconciliation and round resets');
