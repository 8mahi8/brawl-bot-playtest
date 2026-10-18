// 2v2 trusted-input integration proof; the server role here is the
// rules-disabled emulator context, NEVER a privileged browser user.
// Does not create/deploy cloud resources or modify existing online labs.
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {initializeTestEnvironment,assertFails,assertSucceeds}=require('@firebase/rules-unit-testing');
const {get,set,ref}=require('firebase/database');
const {makeMatch,clientSummary}=require('../draft/trusted-match-core.cjs');
const {consumeIntent}=require('../draft/trusted-match-service.cjs');
if(!/^(127\.0\.0\.1|localhost):9000$/.test(process.env.FIREBASE_DATABASE_EMULATOR_HOST||''))
 throw Error('Do not run trusted coordinator integration outside localhost emulator');
const rules=fs.readFileSync(path.resolve(__dirname,'../network/staging/DRAFT_AUTHZ_INPUT_GATE_TEST_ONLY.rules.json'),'utf8');
const room='TESTMATCH4E',base='draftStagingRooms/'+room;
const ids={blue1:'alice0001',blue2:'alice0002',red1:'bob00001',red2:'bob00002'};
const connections={alice0001:'conn-alice001',alice0002:'conn-alice002',
 bob00001:'conn-bob00001',bob00002:'conn-bob00002'};
const pathFor=(db,tail='')=>ref(db,base+(tail?'/'+tail:''));
let checked=0;
async function run(){
 const env=await initializeTestEnvironment({
  projectId:'demo-brawl-draft-staging-authz',
  database:{host:'127.0.0.1',port:9000,rules}
 });
 const a=env.authenticatedContext(ids.blue1).database();
 const b=env.authenticatedContext(ids.blue2).database();
 const enemy=env.authenticatedContext(ids.red1).database();
 const rogue=env.unauthenticatedContext().database();
 const now=Date.now();
 const game=makeMatch(ids,'match-000001',now-250);
 game.hp[ids.red1]=10;game.hp[ids.red2]=10; // trusted test fixture only
 const seed={server:game,public:clientSummary(game),members:{},sessions:{},
  acceptedSeq:{},inputs:{},views:{},receipts:{}};
 for(const [seat,uid] of Object.entries(ids)){
  seed.members[uid]={state:'active',seat};
  seed.sessions[uid]={connectionId:connections[uid],expiresAt:now+120000};
  seed.acceptedSeq[uid]=0;
  seed.views[uid]={phase:'playing',round:1,hp:game.hp[uid]};
 }
 const admin=async fn=>{let outcome;
  await env.withSecurityRulesDisabled(async ctx=>{outcome=await fn(ctx.database());});
  return outcome;
 };
 const adminGet=tail=>admin(async db=>(await get(pathFor(db,tail))).val());
 const submit=(db,uid,key,intent)=>set(pathFor(db,'inputs/'+uid+'/'+key),intent);
 const intent=(uid,type,seq,extra={})=>({
  type,seq,matchId:game.matchId,round:1,life:0,
  connectionId:connections[uid],at:Date.now(),x:1900,y:900,
  angle:0,reach:300,...extra
 });
 const consume=(uid,key)=>admin(db=>consumeIntent({db,roomId:room,uid,actionId:key,now:Date.now()}));
 try{
  await admin(db=>set(pathFor(db),seed));
  await assertFails(set(pathFor(a,'server/hp/'+ids.red1),0));checked++;
  await assertFails(set(pathFor(enemy,'server/winner'),'red'));checked++;
  await assertFails(set(pathFor(rogue,'inputs/'+ids.blue1+'/action-9999'),intent(ids.blue1,'shot',1)));checked++;
  await assertFails(set(pathFor(a,'positions/'+ids.blue1),{x:1800,y:950}));checked++;
  // Legitimate move only specifies a direction. Forged position is ignored.
  const move=intent(ids.blue1,'move',1,{dx:1,dy:0});
  await assertSucceeds(submit(a,ids.blue1,'action-move001',move));checked++;
  const moved=await consume(ids.blue1,'action-move001');
  assert(moved.accepted,'server must accept authorized movement: '+JSON.stringify(moved));
  const pos=await adminGet('server/players/'+ids.blue1);
  assert(pos.x>=500&&pos.x<=530&&pos.y===420);
  assert(pos.x!==1900&&pos.y!==900,'untrusted coordinate cannot teleport player');checked++;
  assert.equal((await adminGet('acceptedSeq/'+ids.blue1)),1);
  await assertSucceeds(get(pathFor(a,'views/'+ids.blue1)));checked++;
  await assertFails(get(pathFor(a,'server/players/'+ids.red1)));checked++;
  await assertFails(get(pathFor(enemy,'views/'+ids.blue1)));checked++;
  // A firing command uses SERVER positions to calculate damage and KO.
  await assertSucceeds(submit(a,ids.blue1,'action-fire001',intent(ids.blue1,'shot',2)));checked++;
  const first=await consume(ids.blue1,'action-fire001');
  assert(first.accepted&&first.events.some(e=>e.type==='hit'&&e.victim===ids.red1));checked++;
  assert.equal(await adminGet('server/hp/'+ids.red1),0);
  assert.equal(await adminGet('server/hp/'+ids.red2),10);
  assert.equal((await adminGet('public/phase')),'playing');
  const same=await consume(ids.blue1,'action-fire001');
  assert.equal(same.revision,first.revision,'trusted consumer duplicate is idempotent');checked++;
  assert.equal(await adminGet('server/hp/'+ids.red1),0);
  await assertFails(submit(a,ids.blue1,'action-fire001',intent(ids.blue1,'shot',3)));checked++;
  await assertFails(submit(a,ids.blue1,'action-forged',intent(ids.blue1,'shot',3,{connectionId:'conn-stolen123'})));checked++;
  await assertFails(submit(a,ids.blue1,'action-badmove',intent(ids.blue1,'move',3,{dx:99,dy:0})));checked++;
  await assertSucceeds(submit(b,ids.blue2,'action-fire002',intent(ids.blue2,'shot',1)));checked++;
  const second=await consume(ids.blue2,'action-fire002');
  assert(second.accepted&&second.events.some(e=>e.type==='round_end'&&e.winner==='blue'));checked++;
  assert.equal(await adminGet('server/hp/'+ids.red2),0);
  assert.equal(await adminGet('server/phase'),'round_end');
  assert.equal(await adminGet('server/score/blue'),1);
  assert.equal(await adminGet('server/score/red'),0);
  assert.equal(await adminGet('public/winner'),'blue');
  assert.equal(await adminGet('public/phase'),'round_end');
  const clientPublic=(await get(pathFor(a,'public'))).val();
  assert.deepEqual(clientPublic.score,{blue:1,red:0});
  assert(!Object.hasOwn(clientPublic,'players')&&!Object.hasOwn(clientPublic,'hp'));checked++;
  await assertFails(submit(a,ids.blue1,'action-afterko',intent(ids.blue1,'shot',3)));checked++;
  await assertFails(submit(enemy,ids.red1,'action-dead000',intent(ids.red1,'shot',1)));checked++;
  console.log('PASS LIVE trusted input emulator: '+checked+
   ' checks, server-owned movement, real server-computed 2-team KO, score visibility, no raw state, no replay');
 }finally{
  await env.cleanup();
 }
}
run().catch(e=>{console.error(e);process.exitCode=1;});
