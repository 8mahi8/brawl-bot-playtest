function inputEventQueueDelay(e,enteredAt=performance.now()){
 let stamp=Number(e?.timeStamp);
 if(!Number.isFinite(stamp)||stamp<=0)return null;
 if(stamp>1e11)stamp-=Number(performance.timeOrigin)||Date.now()-performance.now();
 const delay=enteredAt-stamp;
 return delay>=-2&&delay<=10000?Math.max(0,Math.round(delay*10)/10):null;
}
