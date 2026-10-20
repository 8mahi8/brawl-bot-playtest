'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {makeAll,spec}=require('../scripts/build-friends-online.cjs');
const source=fs.readFileSync(spec.modules.squadProjectileVisual,'utf8');
const env={Math,Number};
vm.createContext(env);vm.runInContext(source,env,{filename:'shared-projectile-visual.js'});
const show=(b,previous=null,targetX=360,targetY=220,weight=.6,nowMs=1000)=>
 env.squadRemoteProjectileVisual(b,previous,targetX,targetY,nowMs,weight,'me');
const remote={owner:'friend',vx:660,vy:0,dist:260,originX:50,originY:220};
const delayed=show(remote);
assert.equal(delayed.x,360,'late authoritative shot starts at latest position, not muzzle');
assert.equal(delayed.y,220);
assert.equal(delayed.bornAt,undefined,'late authoritative shot does not replay from muzzle');
const fresh=show({...remote,dist:30},null,80,220);
assert.equal(fresh.x,80,'fresh shot never rewinds its actual projectile position');
assert.equal(fresh.flash,true,'very recent shot can show a harmless muzzle flash');
assert.equal(fresh.originX,50);
const noOrigin=show({...remote,dist:20,originX:undefined},null,80,220);
assert.equal(noOrigin.flash,undefined,'invalid origin never creates phantom muzzle');
const bounced=show({...remote,dist:0,ricochetUsed:1},null,80,220);
assert.equal(bounced.flash,undefined,'ricochet does not re-flash muzzle');
const fromPreview=show(remote,{x:100,y:220},360,220,.6);
assert.equal(fromPreview.x,256,'ACTION preview smoothly hands off to authoritative position');
assert.equal(fromPreview.y,220);
const oldFlash=show(remote,{x:80,y:220,bornAt:900,flash:true},85,220,.6,1100);
assert.equal(oldFlash.bornAt,undefined,'muzzle flash state expires');
const stage=makeAll();
for(const name of ['normal.2vs2','draft.2vs2']){
 assert(stage[name].html.includes(source.trimEnd()),'same new renderer generated in '+name);
 const frozen=fs.readFileSync(spec.modes[name].source,'utf8');
 assert(!frozen.includes('const travelledMs='),'pinned source HTML unchanged in '+name);
}
for(const name of ['normal.1vs1','draft.1vs1'])
 assert(!stage[name].html.includes('const travelledMs='),'2v2 renderer never leaks into '+name);
const normal=stage['normal.2vs2'].html,endpoint='https://mygame-df915-default-rtdb.firebaseio.com/';
assert(normal.includes("el.value=stored||'"+endpoint+"';"),'normal 2v2 pre-fills correct RTDB');
assert(normal.includes("const value=(el?.value||stored||'"+endpoint+"').trim();"),
 'normal 2v2 accepts room number without manual Firebase endpoint');
assert(normal.includes('ルーム番号だけで参加できます。接続先設定は通常不要です。'));
assert(!normal.includes('オンライン開発検証版。安全な隔離Firebaseのテスト環境専用。まだ公開しないでください。'));
assert(!fs.readFileSync(spec.modes['normal.2vs2'].source,'utf8').includes(endpoint),
 'existing normal 2v2 source remains pinned');
const start=normal.indexOf('window.BrawlOnlineConfig = Object.freeze(');
const end=normal.indexOf("document.addEventListener('DOMContentLoaded'",start);
assert(start>=0&&end>start);
const settings={value:''},storage=new Map();
const configEnv={document:{getElementById:()=>settings},
 localStorage:{getItem:k=>storage.get(k)||'',setItem:(k,v)=>storage.set(k,v)},Object};
configEnv.window=configEnv;
vm.createContext(configEnv);vm.runInContext(normal.slice(start,end),configEnv);
assert.equal(configEnv.BrawlOnlineConfig.get(),endpoint,'fresh iPad gets the correct DB automatically');
settings.value='';
configEnv.BrawlOnlineConfig.prefill();
assert.equal(settings.value,endpoint,'new iPad sees a valid default');
settings.value='https://demo-brawl-draft-beta-default-rtdb.firebaseio.com/';
assert.equal(configEnv.BrawlOnlineConfig.get(),settings.value,'local emulator override stays possible');
console.log('PASS V3.8 remote 2v2 bullets never replay delayed snapshots; normal 2v2 joins by room code; all four modes isolated');
