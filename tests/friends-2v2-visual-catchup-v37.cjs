'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {makeAll,spec}=require('../scripts/build-friends-online.cjs');
const src=fs.readFileSync(spec.modules.squadEarlyShots,'utf8');
const from=src.indexOf('function observeShotAction('),to=src.indexOf('function renderEarlyShots(',from);
assert(from>=0&&to>from);
const observe=src.slice(from,to);
const clock={now:1000};
const env={
 Map,Math,Number,performance:{now:()=>clock.now},
 earlyShots:new Map(),earlyShotStats:{incoming:0,bomber:0},
 connected:true,paused:false,game:{phase:'playing',matchId:'m',round:1,stats:{remote:{char:'sniper',lastActionSeq:0}}},
 myId:'self',presence:{remote:{conn:true}},CHARS:{sniper:{range:600}},serverNow:()=>10000,
 clamp:(x,min,max)=>Math.max(min,Math.min(max,x))
};
vm.createContext(env);vm.runInContext(observe,env);
const action=(age,seq)=>({type:'shot',owner:'remote',connectionId:'conn',eventId:'shot'+seq,
 matchId:'m',round:1,seq,at:10000-age});
for(const [age,expected]of [[0,0],[180,180],[350,350],[450,450],[700,450]]){
 const a=action(age,age+1);env.observeShotAction(a,false);
 assert.equal(env.earlyShots.get(a.eventId).initial,expected,'visual catches up to bounded age '+age);
}
const stale=action(900,901);env.observeShotAction(stale,false);
assert(!env.earlyShots.has(stale.eventId),'expired shots do not reappear');
const staged=makeAll(null,null,null,null,null,false);
for(const name of ['normal.2vs2','draft.2vs2']){
 assert(staged[name].html.includes(src.trimEnd()),'both 2v2 modes use improved visuals');
 assert(!fs.readFileSync(spec.modes[name].source,'utf8').includes('initial:clamp(age,0,450)'),
 'published candidate is unchanged');
}
for(const name of ['normal.1vs1','draft.1vs1'])
 assert(!staged[name].html.includes('initial:clamp(age,0,450)'),'no duel regression');
console.log('PASS 2v2 late-action visual catch-up: 180/350ms, bounded stale recovery, no 1v1/production changes');
