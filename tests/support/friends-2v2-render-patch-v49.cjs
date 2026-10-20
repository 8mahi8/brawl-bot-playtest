'use strict';
// Exact-staging-only HTML injection. Never writes to deployed HTML/Firebase.
const assert=require('node:assert/strict');
function one(html,before,after,label,expected=1){
 const n=html.split(before).length-1;
 assert.equal(n,expected,label+' anchor count '+n);
 return html.replaceAll(before,after);
}
function instrumentV49(html,probe){
 assert(probe.includes('window.__v49ShotFrames=Object.freeze('),'probe source missing');
 assert(!html.includes('window.__v49ShotFrames'),'cannot inject twice');
 html=one(html,'window.__brawlV3QA=()=>({',
  probe.trimEnd()+'\nwindow.__brawlV3QA=()=>({','insert V4.9 local-only probe');
 const receive="window.__brawlLagV39QA.tap('receive',a,serverNow()-a.at);";
 html=one(html,receive,receive+'window.__v49ShotFrames.receive(a);','real remote ACTION listener');
 const frame='function frame(now){const elapsed=';
 html=one(html,frame,
  'function frame(now){window.__v49ShotFrames.frame(performance.now());const elapsed=',
  'requestAnimationFrame callback');
 const decision='if(shouldDrawCanvasFrame(now)){const start=performance.now();draw(dt);';
 html=one(html,decision,
  'if(window.__v49ShotFrames.drawDecision(shouldDrawCanvasFrame(now),performance.now())){const start=performance.now();draw(dt);',
  'real Canvas draw/skipped decision');
 const early="window.__brawlLagV39QA.tap('visual',a);";
 html=one(html,early,early+"window.__v49ShotFrames.visual(a.eventId,'early');",
  'early bullet and Bomber draw',2);
 const authoritative="if(!previous&&bullet.owner!==myId&&bullet.fireId)\n    window.__brawlLagV39QA.tap('visual',{eventId:bullet.fireId});";
 html=one(html,authoritative,
  "if(!previous&&bullet.owner!==myId&&bullet.fireId){\n    window.__brawlLagV39QA.tap('visual',{eventId:bullet.fireId});\n    window.__v49ShotFrames.visual(bullet.fireId,'authoritative');\n   }",
  'host confirmed projectile fallback');
 return html;
}
module.exports={instrumentV49};
