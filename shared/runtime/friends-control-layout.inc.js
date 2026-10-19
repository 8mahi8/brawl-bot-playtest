// BRAWL friends control editor: shared pure geometry and saved-point parsing.
// 'duel' and 'squad' profiles intentionally preserve each current game's
// centering/size limits. Do NOT change existing localStorage keys.
const BrawlControlLayoutV1=Object.freeze((()=>{
 const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
 function displaySize(point,width,height,profile){
  if(profile==='duel')return Math.min(point.size,Math.max(40,height*.36),Math.max(40,width*.42));
  if(profile==='squad')return Math.min(point.size,Math.max(30,Math.min(width,height)*.30));
  throw Error('Unsupported control profile');
 }
 function center(point,width,height,size){
  return {x:clamp(point.x*width,size/2+4,width-size/2-4),
    y:clamp(point.y*height,size/2+4,height-size/2-4)};
 }
 function dragPoint(ev,rect,size){
  return {x:clamp((ev.clientX-rect.left)/rect.width,(size/2+4)/rect.width,1-(size/2+4)/rect.width),
    y:clamp((ev.clientY-rect.top)/rect.height,(size/2+4)/rect.height,1-(size/2+4)/rect.height)};
 }
 function restorePoint(saved,defaults,profile){
  if(profile==='duel'){
   if(!saved||!Number.isFinite(saved.x)||!Number.isFinite(saved.y)||!Number.isFinite(saved.size))
    return {...defaults};
   return {x:clamp(saved.x,0,1),y:clamp(saved.y,0,1),size:clamp(saved.size,44,100)};
  }
  if(profile==='squad'){
   return {x:clamp(Number(saved?.x)||defaults.x,.07,.93),
     y:clamp(Number(saved?.y)||defaults.y,.12,.91),
     size:clamp(Number(saved?.size)||defaults.size,44,100)};
  }
  if(profile==='squad-gad2'){
   if(!saved||!Number.isFinite(saved.x)||!Number.isFinite(saved.y)||!Number.isFinite(saved.size))
    return {...defaults};
   return {x:clamp(saved.x,.07,.93),y:clamp(saved.y,.12,.91),size:clamp(saved.size,44,100)};
  }
  throw Error('Unsupported control profile');
 }
 return {displaySize,center,dragPoint,restorePoint};
})());
