// Emulator-only trusted input processor: caller supplies privileged SDK database.
// Future cloud deployment needs a single trusted worker, authenticated queue
// events and production concurrency hardening. Never call from the browser.
'use strict';
const {ref,get,set,runTransaction,update}=require('firebase/database');
const {applyIntent,clientSummary}=require('./trusted-match-core.cjs');
const good=x=>typeof x==='string'&&/^[\w-]{8,80}$/.test(x);
async function consumeIntent({db,roomId,uid,actionId,now=Date.now()}){
 if(!db||!good(roomId)||!good(uid)||!good(actionId)||!Number.isFinite(now))
  throw Error('Invalid trusted coordinator arguments');
 const root='draftStagingRooms/'+roomId;
 const at=sub=>ref(db,root+'/'+sub);
 const [inputSnap,memberSnap,sessionSnap,receiptSnap]=await Promise.all([
  get(at('inputs/'+uid+'/'+actionId)),get(at('members/'+uid)),
  get(at('sessions/'+uid)),get(at('receipts/'+uid+'/'+actionId))
 ]);
 // Retry after successful publication must be idempotent.
 if(receiptSnap.exists())return receiptSnap.val();
 const intent=inputSnap.val(),member=memberSnap.val(),session=sessionSnap.val();
 if(!intent)return {accepted:false,reason:'input_not_found'};
 const deny=reason=>({accepted:false,reason});
 if(member?.state!=='active'||!session||session.expiresAt<=now)
  return deny('membership_or_session');
 if(intent.connectionId!==session.connectionId)return deny('connection');
 // The Firebase JS RTDB transaction updater can initially receive null while
 // its local cache is cold. Prime the server-only snapshot before deciding.
 const snapshot=await get(at('server'));
 if(!snapshot.exists())return deny('server_not_found');
 // Transaction serializes accepted intents: concurrent attempts cannot both
 // use the same last sequence. All hit/motion results are computed server-side.
 let latest=null;
 const baseline=snapshot.val();
 const txn=await runTransaction(at('server'),current=>{
  // RTDB web SDK first invokes a cold transaction with null. Seed that
  // speculative local pass from the trusted server snapshot; the emulator
  // then performs the normal compare-and-retry against authoritative state.
  // This compatibility bridge is test-only; a deployed service must use
  // a privileged Admin SDK transaction with explicit deletion semantics.
  current=current||baseline;
  latest=applyIntent({state:current,uid,actionId,intent,
   connectionId:session.connectionId,now});
  return latest.accepted?latest.state:undefined;
 },{applyLocally:false});
 if(!txn.committed){
  // No client may write receipts or canonical match state.
  const status=deny(latest?.reason||'transaction_not_committed');
  await set(at('receipts/'+uid+'/'+actionId),status);
  return status;
 }
 const state=txn.snapshot.val();
 const decision={accepted:true,reason:'ok',revision:state.revision,
   events:latest?.events||[]};
 // Prototype projection: server-only writes. A later production backend must
 // serialize projection writes by committed revision to avoid stale view races.
 await update(ref(db,root),{
  ['acceptedSeq/'+uid]:state.lastSeq[uid],
  public:clientSummary(state),
  ['views/'+uid]:{
   phase:state.phase,round:state.round,hp:state.hp[uid],
   x:state.players[uid].x,y:state.players[uid].y,
   ammo:state.players[uid].ammo,revision:state.revision
  },
  ['receipts/'+uid+'/'+actionId]:decision
 });
 return decision;
}
module.exports={consumeIntent};
