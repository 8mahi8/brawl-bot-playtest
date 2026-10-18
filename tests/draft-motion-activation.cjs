// Verify moving_reload is earned through continuous real displacement.
// Load the actual standalone draft integration helpers (not rewritten stand-ins).
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../draft/duel-bot-prototype.inc.js'),'utf8');
const html=fs.readFileSync(path.join(__dirname,'../online/draft-duel-lab.html'),'utf8');
assert(html.includes(source),'standalone HTML must include the tested draft code verbatim');
const motion=source.match(/\/\/ DRAFT MOTION GATE START([\s\S]*?)\/\/ DRAFT MOTION GATE END/);
const track=source.match(/  function draftTrackMotion\(side,moving\)\{[\s\S]*?\n  \}/);
const reload=source.match(/  function draftReloadRate\(side\)\{[\s\S]*?\n  \}/);
assert(motion&&track&&reload,'motion gate, tracker and reload must exist in source');
const script=[
  'let solo=true,clock=1000;',
  'let local={ammo:1},botBrain={ammo:1};',
  'let draftMoveSince={host:null,guest:null};',
  'const time=()=>clock;',
  'const draftHas=(side,id)=>id==="moving_reload"||id==="last_shell";',
  motion[1],track[0],reload[0],
  '({draftDidMove,draftTrackMotion,draftReloadRate,advance:ms=>clock+=ms,',
  ' setAmmo:(side,ammo)=>{if(side==="host")local.ammo=ammo;else botBrain.ammo=ammo;},',
  ' since:side=>draftMoveSince[side]})'
].join('\n');
const p=vm.runInNewContext(script,{}, {timeout:1000});
const step=1/60,speed=102,delta=speed*step;
assert.equal(p.draftDidMove(0,0,0,0,step,speed,true),false,'stationary touch does not move');
assert.equal(p.draftDidMove(0,0,delta,0,step,speed,false),false,'no movement intent');
assert.equal(p.draftDidMove(0,0,.02,.02,step,speed,true),false,'wall-blocked touch');
assert.equal(p.draftDidMove(0,0,delta,0,step,speed,true),true,'normal input displacement');
assert.equal(p.draftDidMove(0,0,delta/2,0,step,speed),true,'slow movement counts');
assert.equal(p.draftDidMove(0,0,delta*.05,0,step,speed),false,'blocked BOT tangent');
assert.equal(p.draftDidMove(0,0,delta,0,0,speed),false,'no zero-dt movement');
assert.equal(p.draftDidMove(0,0,delta,0,step,NaN),false,'invalid velocity');
for(const side of ['host','guest']){
  p.setAmmo(side,1);
  assert.equal(p.draftReloadRate(side),1,'no card acceleration while still');
  p.draftTrackMotion(side,p.draftDidMove(0,0,delta,0,step,speed));
  p.advance(799);
  assert.equal(p.draftReloadRate(side),1,'under 0.8s must not trigger');
  p.advance(1);
  assert.equal(p.draftReloadRate(side),1.12,'continuous real movement activates card');
  p.setAmmo(side,0);
  assert.equal(p.draftReloadRate(side),1.2,'last-shell and motion cap stack at 20%');
  p.draftTrackMotion(side,p.draftDidMove(0,0,.01,0,step,speed));
  assert.equal(p.since(side),null,'blocked movement resets sustained streak');
  assert.equal(p.draftReloadRate(side),1.16,'no phantom motion bonus after stop');
  p.setAmmo(side,1);
  p.draftTrackMotion(side,true);
  p.advance(400);
  assert.equal(p.draftReloadRate(side),1,'streak restarts, not carried over');
  p.draftTrackMotion(side,false);
}
assert(html.includes("if(solo)draftTrackMotion('host',draftDidMove("),'player displacement must drive motion');
assert(html.includes("draftTrackMotion('guest',draftDidMove("),'BOT displacement must drive motion');
assert(!html.includes("draftTrackMotion('guest',true)"),'BOT must not get perpetual free motion bonus');
assert(!html.includes("draftTrackMotion('host',left.id!==null)"),'touch ID alone is insufficient');
// Read BOT reload logic ordering, so it uses the current frame's motion state.
const botMotion=html.indexOf("draftTrackMotion('guest',draftDidMove(");
const botReload=html.indexOf("brain.reload+=dt*draftReloadRate('guest')");
assert(botMotion>=0&&botReload>botMotion,'BOT bonus calculated after actual movement');
console.log('PASS moving reload: real displacement for host/BOT, 800ms, 20% cap, stop/reset, no phantom activation');
