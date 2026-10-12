// Shared stealth visibility for both BRAWL modes. Inlined inside BrawlStealthV1 closure; accesses RADIUS.
 function state({viewer,target,concealed,revealedUntil=0,now=0}){
  if(!concealed)return 'visible';
  if(now<revealedUntil)return 'revealed';
  if(viewer&&target&&Math.hypot(viewer.x-target.x,viewer.y-target.y)<=RADIUS)return 'detected';
  return 'hidden';
 }
 function visible(args){return state(args)!=='hidden';}
