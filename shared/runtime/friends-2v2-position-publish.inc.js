// Only active motion needs the 80ms network cadence. Static players still
// heartbeat every 500ms; facing changes, motion start/stop, and new
// Firebase connection IDs immediately trigger a position packet.
const POSITION_ACTIVE_INTERVAL_MS=80,POSITION_IDLE_HEARTBEAT_MS=500;
function positionPublishDue(previous,next,elapsedMs){
 if(!previous||previous.connectionId!==next.connectionId||previous.matchId!==next.matchId||
    previous.round!==next.round||previous.motionRev!==next.motionRev||previous.life!==next.life)return true;
 if(elapsedMs<POSITION_ACTIVE_INTERVAL_MS)return false;
 if(elapsedMs>=POSITION_IDLE_HEARTBEAT_MS)return true;
 const moving=Math.hypot(next.vx||0,next.vy||0)>4||Math.hypot(previous.vx||0,previous.vy||0)>4;
 const turned=Math.abs(Math.atan2(Math.sin(next.a-previous.a),Math.cos(next.a-previous.a)))>.04;
 return moving||turned||Math.hypot(next.x-previous.x,next.y-previous.y)>.4;
}
