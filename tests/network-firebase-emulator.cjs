// Firebase RTDB EMULATOR ONLY; no production credentials or deployed database.
'use strict';
const fs=require('node:fs');
const assert=require('node:assert/strict');
const {initializeTestEnvironment,assertSucceeds,assertFails}=require('@firebase/rules-unit-testing');
async function main(){
 const host=process.env.FIREBASE_DATABASE_EMULATOR_HOST;
 if(!host||!/^(127\.0\.0\.1|localhost):9000$/.test(host))throw Error('Local emulator 127.0.0.1:9000 required');
 const [address,port]=host.split(':');
 const env=await initializeTestEnvironment({
  projectId:'demo-brawl-lab',
  database:{host:address,port:Number(port),rules:fs.readFileSync('network/emulator/database.rules.json','utf8')}
 });
 let n=0;
 async function ok(label,p){await assertSucceeds(p);console.log('PASS allow '+label);n++;}
 async function no(label,p){await assertFails(p);console.log('PASS deny '+label);n++;}
 const client=uid=>env.authenticatedContext(uid).database();
 const alice=client('alice'),bob=client('bob'),charlie=client('charlie'),dana=client('dana'),outsider=client('stranger');
 const anonymous=env.unauthenticatedContext().database();
 const path=(mode,room,key)=>'lab/'+mode+'/'+room+'/'+key;
 try{
  await env.withSecurityRulesDisabled(async ctx=>{
   const db=ctx.database();
   await db.ref('lab/pair/p1').set({
    members:{alice:true,bob:true},round:1,hostUid:'alice',
    game:{combatRev:0,round:1,hp:{alice:100,bob:180}}
   });
   await db.ref('lab/squad/s1').set({
    members:{alice:true,bob:true,charlie:true,dana:true},
    hostUid:'alice',round:1,matchId:'m1',
    presence:{alice:{connectionId:'conn1'},bob:{connectionId:'conn1'},charlie:{connectionId:'conn1'},dana:{connectionId:'conn1'}},
    life:{alice:0,bob:0,charlie:0,dana:0},
    motionRev:{alice:0,bob:0,charlie:0,dana:0},
    game:{combatRev:0,round:1,hp:{alice:100,bob:180,charlie:100,dana:100}}
   });
  });
  const pp=(seq,ex={})=>({seq,round:1,x:210,y:250,...ex});
  const sp=(seq,ex={})=>({seq,round:1,matchId:'m1',connectionId:'conn1',life:0,motionRev:0,x:210,y:250,...ex});
  await ok('pair authenticated member read',alice.ref('lab/pair/p1').once('value'));
  await no('pair outsider read',outsider.ref('lab/pair/p1').once('value'));
  await no('pair anonymous read',anonymous.ref('lab/pair/p1').once('value'));
  await ok('pair self position',alice.ref(path('pair','p1','positions/alice')).set(pp(1)));
  await ok('pair opponent self position',bob.ref(path('pair','p1','positions/bob')).set(pp(1)));
  await no('pair other member position',bob.ref(path('pair','p1','positions/alice')).set(pp(2)));
  await no('pair duplicate seq',alice.ref(path('pair','p1','positions/alice')).set(pp(1)));
  await no('pair old round',alice.ref(path('pair','p1','positions/alice')).set(pp(2,{round:2})));
  await no('pair impossible coordinate',alice.ref(path('pair','p1','positions/alice')).set(pp(2,{x:999999})));
  await no('pair host hijack',bob.ref(path('pair','p1','hostUid')).set('bob'));
  await no('pair membership hijack',bob.ref(path('pair','p1','members/stranger')).set(true));
  await ok('pair host authoritative HP',alice.ref(path('pair','p1','game')).set({combatRev:1,round:1,hp:{alice:100,bob:170}}));
  await no('pair guest cannot forge HP',bob.ref(path('pair','p1','game')).set({combatRev:2,round:1,hp:{alice:0,bob:180}}));
  await no('pair host revision replay',alice.ref(path('pair','p1','game')).set({combatRev:1,round:1,hp:{alice:100,bob:160}}));
  await ok('pair own action',bob.ref(path('pair','p1','actions/bob/event1')).set({seq:1,round:1,type:'shot'}));
  await no('pair action overwrite',bob.ref(path('pair','p1','actions/bob/event1')).set({seq:2,round:1,type:'shot'}));
  await no('pair other player action',bob.ref(path('pair','p1','actions/alice/event2')).set({seq:1,round:1,type:'shot'}));
  await ok('squad authenticated member read',charlie.ref('lab/squad/s1').once('value'));
  await no('squad outsider read',outsider.ref('lab/squad/s1').once('value'));
  for(const [id,db]of [['alice',alice],['bob',bob],['charlie',charlie],['dana',dana]]){
   await ok('squad '+id+' self position',db.ref(path('squad','s1','positions/'+id)).set(sp(1)));
  }
  await no('squad opponent impersonation',bob.ref(path('squad','s1','positions/charlie')).set(sp(2)));
  await no('squad wrong connection',alice.ref(path('squad','s1','positions/alice')).set(sp(2,{connectionId:'old'})));
  await no('squad wrong match',alice.ref(path('squad','s1','positions/alice')).set(sp(2,{matchId:'other'})));
  await no('squad wrong life',alice.ref(path('squad','s1','positions/alice')).set(sp(2,{life:1})));
  await no('squad wrong motion revision',alice.ref(path('squad','s1','positions/alice')).set(sp(2,{motionRev:1})));
  await no('squad replay seq',alice.ref(path('squad','s1','positions/alice')).set(sp(1)));
  await no('squad presence hijack',bob.ref(path('squad','s1','presence/bob/connectionId')).set('stolen'));
  await no('squad host hijack',bob.ref(path('squad','s1','hostUid')).set('bob'));
  await ok('squad host game transaction',alice.ref(path('squad','s1','game')).set({combatRev:1,round:1,hp:{alice:100,bob:180,charlie:90,dana:100}}));
  await no('squad nonhost HP alteration',charlie.ref(path('squad','s1','game')).set({combatRev:2,round:1,hp:{alice:0,bob:180,charlie:90,dana:100}}));
  await no('squad host cannot jump revision',alice.ref(path('squad','s1','game')).set({combatRev:50,round:1,hp:{alice:100,bob:180,charlie:80,dana:100}}));
  await ok('squad own action',dana.ref(path('squad','s1','actions/dana/a1')).set({seq:1,round:1,life:0,matchId:'m1',type:'gadget'}));
  await no('squad future life action',dana.ref(path('squad','s1','actions/dana/a2')).set({seq:2,round:1,life:1,matchId:'m1',type:'shot'}));
  await env.withSecurityRulesDisabled(async ctx=>{
   await ctx.database().ref(path('squad','s1','presence/alice/connectionId')).set('conn2');
   await ctx.database().ref(path('squad','s1','life/alice')).set(1);
  });
  await no('squad stale connection after rotation',alice.ref(path('squad','s1','positions/alice')).set(sp(900)));
  await ok('squad new connection/life can reset sequence',alice.ref(path('squad','s1','positions/alice')).set(sp(1,{connectionId:'conn2',life:1})));
  await no('live path denied',alice.ref('rooms/live').set({game:{hp:0}}));
  console.log('PASS '+n+' real RTDB emulator Auth/Rules read-write assertions');
  console.log('LOCAL EMULATOR ONLY: privileged fixture setup is not a host election implementation; no live DB involved.');
 }finally{await env.cleanup();}
}
main().catch(err=>{console.error(err.stack||String(err));process.exitCode=1;});
