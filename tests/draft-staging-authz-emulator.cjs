// Isolated RTDB AuthZ proof. MUST run only against the loopback database emulator.
// This is NOT an online-playable game and never touches production projects.
'use strict';
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const {initializeTestEnvironment,assertFails,assertSucceeds}=require('@firebase/rules-unit-testing');
const {get,set,update,remove,ref}=require('firebase/database');
if(!/^(127\.0\.0\.1|localhost):9000$/.test(process.env.FIREBASE_DATABASE_EMULATOR_HOST||'')){
 throw Error('Staging authorization tests require the localhost RTDB emulator, not a cloud endpoint');
}
const root=path.resolve(__dirname,'..');
const rules=fs.readFileSync(path.join(root,'network/staging/DRAFT_AUTHZ_INPUT_GATE_TEST_ONLY.rules.json'),'utf8');
const base='draftStagingRooms/TESTROOM42';
const connA='connection-alice001',connB='connection-bob00001',match='match-000001';
let passes=0;
async function allowed(name,operation){
 await assertSucceeds(operation);
 console.log('PASS ALLOW '+name);passes++;
}
async function denied(name,operation){
 await assertFails(operation);
 console.log('PASS DENY '+name);passes++;
}
async function run(){
 const env=await initializeTestEnvironment({
  projectId:'demo-brawl-draft-staging-authz',
  database:{host:'127.0.0.1',port:9000,rules}
 });
 const alice=env.authenticatedContext('alice').database();
 const bob=env.authenticatedContext('bob').database();
 const stranger=env.authenticatedContext('mallory').database();
 const anonymous=env.unauthenticatedContext().database();
 const p=(db,sub='')=>ref(db,base+(sub?'/'+sub:''));
 const now=Date.now();
 const seed={
  members:{alice:{state:'active',seat:'blue1'},bob:{state:'active',seat:'red1'}},
  sessions:{
   alice:{connectionId:connA,expiresAt:now+120000},
   bob:{connectionId:connB,expiresAt:now+120000}
  },
  acceptedSeq:{alice:0,bob:0},
  server:{phase:'playing',matchId:match,round:1,
   lives:{alice:0,bob:0},hp:{alice:160,bob:160},
   scores:{blue:0,red:0},winner:'none'},
  public:{phase:'playing',round:1,score:{blue:0,red:0}},
  views:{alice:{visibleEnemyCount:0},bob:{visibleEnemyCount:1}},
  receipts:{alice:{pending:0},bob:{pending:0}}
 };
 async function privileged(sub,value){
  await env.withSecurityRulesDisabled(ctx=>set(p(ctx.database(),sub),value));
 }
 try{
  await privileged('',seed);
  const action=(connectionId=connA)=>({type:'shot',seq:1,matchId:match,
   round:1,life:0,connectionId,at:Date.now(),x:525,y:420,angle:0,reach:300});
  const position=(connectionId=connA)=>({connectionId,matchId:match,
   round:1,life:0,seq:1,x:520,y:420,a:0,at:Date.now()});
  // Only explicitly server-published sanitized fields may be read.
  await allowed('member read public scoreboard',get(p(alice,'public')));
  await allowed('member read own sanitized view',get(p(alice,'views/alice')));
  await allowed('member read own session',get(p(alice,'sessions/alice')));
  await allowed('member read own receipts',get(p(alice,'receipts/alice')));
  await denied('anonymous read',get(p(anonymous,'public')));
  await denied('nonmember read',get(p(stranger,'public')));
  await denied('other player private view',get(p(alice,'views/bob')));
  await denied('other player session',get(p(alice,'sessions/bob')));
  await denied('whole-room read blocked (concealed actors)',get(p(alice)));
  await denied('raw authoritative game state cannot be read',get(p(alice,'server')));
  await denied('raw opponent positions cannot be read',get(p(alice,'positions/bob')));

  // Server-only data and membership cannot be written from any browser.
  await denied('unauthenticated score tamper',set(p(anonymous,'server/scores/blue'),999));
  await denied('player score tamper',set(p(alice,'server/scores/blue'),999));
  await denied('forged match winner',set(p(bob,'server/winner'),'red'));
  await denied('self-service membership escalation',set(p(stranger,'members/mallory'),{state:'active'}));
  await denied('rotate own trusted session from client',set(p(alice,'sessions/alice/connectionId'),'attacker00001'));
  await denied('forge server accepted sequence',set(p(alice,'acceptedSeq/alice'),999));
  await denied('client cannot overwrite public scoreboard',set(p(alice,'public/score/blue'),99));

  // Browser may append immutable, scoped inputs; trusted server computes combat.
  await denied('anonymous player shot',set(p(anonymous,'inputs/alice/action-0001'),action()));
  await denied('other UID cannot forge shot',set(p(bob,'inputs/alice/action-0001'),action()));
  await denied('nonmember cannot forge shot',set(p(stranger,'inputs/mallory/action-0001'),action('conn-mallory')));
  await denied('incorrect session token shot',set(p(alice,'inputs/alice/action-0001'),action('connection-stolen001')));
  await denied('stale action timestamp',set(p(alice,'inputs/alice/action-0001'),{...action(),at:Date.now()-90000}));
  await denied('out of bounds shot location',set(p(alice,'inputs/alice/action-0001'),{...action(),x:9999}));
  await denied('unexpected action field',set(p(alice,'inputs/alice/action-0001'),{...action(),winner:'blue'}));
  await denied('forged draft card type',set(p(alice,'inputs/alice/action-0001'),{...action(),type:'force-win'}));
  await denied('incorrect match round',set(p(alice,'inputs/alice/action-0001'),{...action(),round:2}));
  await denied('incorrect life generation',set(p(alice,'inputs/alice/action-0001'),{...action(),life:3}));
  await allowed('authenticated valid normal shot',set(p(alice,'inputs/alice/action-0001'),action()));
  await denied('replay same action ID cannot overwrite',set(p(alice,'inputs/alice/action-0001'),{...action(),seq:2}));
  await denied('action cannot be deleted by player',remove(p(alice,'inputs/alice/action-0001')));
  await denied('atomic parent update cannot bypass protected game',update(p(alice),{
   'server/scores/blue':999,'inputs/alice/action-0002':{...action(),seq:2}
  }));
  await privileged('acceptedSeq/alice',1);
  await denied('accepted sequence replay',set(p(alice,'inputs/alice/action-0002'),action()));
  await allowed('fresh action after server sequence update',set(p(alice,'inputs/alice/action-0002'),{...action(),seq:2}));

  await denied('player cannot move teammate',set(p(alice,'positions/bob'),position(connB)));
  await denied('invalid position session',set(p(alice,'positions/alice'),position('connection-fake')));
  await denied('position with impossible coordinates',set(p(alice,'positions/alice'),{...position(),x:20000}));
  await allowed('valid owner scoped position',set(p(alice,'positions/alice'),position()));
  await denied('position replay sequence',set(p(alice,'positions/alice'),position()));
  await allowed('later position packet',set(p(alice,'positions/alice'),{...position(),seq:2,x:580}));

  await denied('teammate presence impersonation',set(p(bob,'presence/alice/'+connA),{since:Date.now()}));
  await denied('other connection may not set presence',set(p(alice,'presence/alice/connection-fake'),{since:Date.now()}));
  await allowed('own live connection presence',set(p(alice,'presence/alice/'+connA),{since:Date.now()}));
  await allowed('own disconnect presence removal',remove(p(alice,'presence/alice/'+connA)));

  // On resume only the trusted side can issue a new connection token;
  // an earlier token must become unusable even with the original auth UID.
  const connA2='connection-alice002';
  await privileged('sessions/alice/connectionId',connA2);
  await denied('stolen previous token cannot send position',set(p(alice,'positions/alice'),{...position(connA),seq:3}));
  await denied('stolen previous token cannot submit action',set(p(alice,'inputs/alice/action-0003'),{...action(connA),seq:3}));
  await allowed('same UID accepts rotated session and next position',set(p(alice,'positions/alice'),{...position(connA2),seq:3}));
  await allowed('same UID accepted after trusted session rotation',set(p(alice,'inputs/alice/action-0003'),{...action(connA2),seq:3}));

  await privileged('server/phase','draft');
  await denied('cannot fire during draft pick phase',set(p(alice,'inputs/alice/action-0004'),{...action(connA2),seq:4}));
  await privileged('server/phase','playing');
  await privileged('server/hp/alice',0);
  await denied('zero HP cannot issue actions',set(p(alice,'inputs/alice/action-0004'),{...action(connA2),seq:4}));
  await privileged('server/hp/alice',160);
  await privileged('sessions/alice/expiresAt',Date.now()-1000);
  await denied('expired session cannot fire',set(p(alice,'inputs/alice/action-0004'),{...action(connA2),seq:4}));
  await privileged('sessions/alice/expiresAt',Date.now()+120000);
  await privileged('members/alice/state','removed');
  await denied('removed member loses view access',get(p(alice,'views/alice')));
  await denied('removed member cannot fire',set(p(alice,'inputs/alice/action-0004'),{...action(connA2),seq:4}));
  let finalScore;
  await env.withSecurityRulesDisabled(async ctx=>{
    const snapshot=await get(p(ctx.database(),'server/scores/blue'));
    finalScore=snapshot.val();
  });
  assert.equal(finalScore,0,'all attacker attempts must leave server-owned score intact');
  console.log('PASS STAGING RTDB AUTHZ '+passes+' allow/deny checks; no production or public state touched');
 }finally{
  await env.cleanup();
 }
}
run().catch(err=>{console.error(err);process.exitCode=1;});
