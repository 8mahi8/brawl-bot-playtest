// Regression: Firebase RTDB rejects undefined values. Every real hit event must
// encode 'no guardian' as explicit null, not the result of Array.find (undefined).
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const sources=['online/ipad-squad-v2-lab.html'];
let assertions=0;
for(const file of sources){
 const html=fs.readFileSync(path.join(root,file),'utf8');
 const match=html.match(/const guardian=h\.owner==='gas'\?null:\(seatKeys\.map\(k=>g\.seats\[k\]\.id\)\.find\(id=>\{[\s\S]*?\}\)\|\|null\);/);
 assert(match,'Un-guarded event must be null-normalized in '+file);
 const body=match[0].replace(/^const guardian/,'var guardian')+'\n return guardian;';
 const cx=vm.createContext({});
 const fn=new vm.Script('(function(h,seatKeys,g,t){'+body+'})',{filename:file}).runInContext(cx);
 const g={
  seats:{blue1:{id:'tank'},blue2:{id:'ally'},red1:{id:'enemy'}},
  stats:{tank:{char:'tank',guardUntil:200,guardTargetId:'ally',guardTargetLife:1,life:1},ally:{char:'gunner',life:1},enemy:{char:'sniper',life:1}},
  hp:{tank:160,ally:100,enemy:70}
 };
 const keys=['blue1','blue2','red1'];
 const eventGuardian=(owner,victim,t)=>fn({owner,victim},keys,g,t);
 function check(label,actual,want){
  assert.equal(actual,want,label+' '+file);
  const event={type:'hit',guardian:actual,owner:'enemy',victim:'ally',damage:14};
  assert(Object.values(event).every(x=>x!==undefined),'No undefined RTDB hit event fields');
  assertions++;
 }
 g.stats.tank.guardUntil=0;
 check('normal hit with no guard',eventGuardian('enemy','ally',100),null);
 g.stats.tank.guardUntil=200;
 check('active allied guardian',eventGuardian('enemy','ally',100),'tank');
 check('environmental gas is unguarded',eventGuardian('gas','ally',100),null);
 check('expired guardian does not emit undefined',eventGuardian('enemy','ally',300),null);
 console.log('PASS '+file+': 4 guardian hit-event cases (RTDB-safe null normalization)');
}
console.log('PASS '+assertions+' actual 2vs2 guard-serialization cases');
