// Four-mode readiness gate for the friend playtest: ALL current public
// pages remain frozen. Only new normal candidates + draft beta/prototype are
// tested. Prevent another remote-bullet visual fix reaching one mode only.
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const root=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const refs={
 normal1:'sites/BRAWL_FRIENDS_1vs1_QA_CANDIDATE.html',
 normal2:'sites/BRAWL_FRIENDS_2vs2_QA_CANDIDATE.html',
 draft1:'sites/BRAWL_DRAFT_FRIENDS_BETA_1vs1.html',
 draft2:'sites/BRAWL_DRAFT_FRIENDS_BETA_2vs2_LAYOUT_PREVIEW.html',
 oldNormal1:'sites/BRAWL_FRIENDS_1vs1.html',
 oldNormal2:'sites/BRAWL_FRIENDS_2vs2.html',
 lab1:'online/ipad-duel-v2-lab.html',
 lab2:'online/ipad-squad-v2-lab.html',
};
const html=Object.fromEntries(Object.entries(refs).map(([k,p])=>[k,read(p)]));
function getFn(src,name){
 const ix=src.indexOf('function '+name+'(');
 assert(ix>=0,'missing '+name);
 const b=src.indexOf('{',ix),limit=src.indexOf('\n  function ',b+1);
 let depth=0,end=-1,quote=null,esc=false,comment=false;
 for(let i=b;i<src.length;i++){
  const c=src[i];
  if(quote){
   if(esc){esc=false;continue;}
   if(c==='\\'){esc=true;continue;}
   if(c===quote)quote=null;
   continue;
  }
  if(c==='\x22'||c==="'"||c==='\x60'){quote=c;continue;}
  if(c==='{')depth++;
  if(c==='}'&&!--depth){end=i+1;break;}
 }
 assert(end>b,'unclosed '+name);
 return src.slice(ix,end);
}
const normalized=s=>s.replace(/\/\/[^\n]*/g,'').replace(/\s+/g,'').trim();
for(const k of Object.keys(refs)){
 const s=html[k];
 for(const [i,m] of [...s.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].entries())
  if(m[1].trim())new vm.Script(m[1],{filename:refs[k]+':'+i});
}
for(const [a,b,lab] of [['normal1','draft1','lab1'],['normal2','draft2','lab2']]){
 const fn=a==='normal1'?'remoteShotDrawPoint':'squadRemoteProjectileVisual';
 const key=getFn(html[a],fn),expected=getFn(html[b],fn);
 assert.equal(normalized(key),normalized(expected),a+' and '+b+' muzzle correction must be identical');
 assert.equal(normalized(key),normalized(getFn(html[lab],fn)),a+' and '+lab+' muzzle correction must match');
}
function section(s,name){
 const start=s.indexOf('BEGIN SHARED '+name),end=s.indexOf('END SHARED '+name,start);
 assert(start>0&&end>start,'missing common '+name);
 return s.slice(start,end);
}
for(const name of ['WEAPON RULES','PROJECTILE PHYSICS','ABILITIES']){
 const origin=section(html.normal1,name);
 for(const k of ['normal2','draft1','draft2'])
  assert.equal(section(html[k],name),origin,'shared '+name+' drift: '+k);
}
for(const k of ['normal1','normal2','draft1','draft2']){
 const s=html[k];
 const chars=s.slice(s.indexOf('const CHARS={'),s.indexOf('\n };',s.indexOf('const CHARS={'))+4);
 for(const [char,hp] of Object.entries({tank:160,gunner:100,bomber:90,sniper:70}))
  assert(new RegExp(char+':\\{[^\n]*hp:'+hp+',speed:102,').test(chars),k+' '+char+' stats');
 assert(s.includes('const BALANCE={'),'balance config: '+k);
}
for(const k of ['normal1','draft1']){
 assert(html[k].includes('seenMuzzleFires.clear()'),k+' muzzle reset on rematch');
 assert(html[k].includes('ctx.arc(pos.x,pos.y,b.radius,0,2*Math.PI)'),k+' actually draws interpolated bullet');
 const s=html[k];assert(s.includes('remoteBirthX=p.x+Math.cos(p.angle)*28'),k+' enemy muzzle birth');
}
for(const k of ['normal2','draft2']){
 assert(html[k].includes('originX:b.x,originY:b.y'),k+' host preserves first shot origin');
 assert(html[k].includes('remoteMuzzleVolleys.clear()'),k+' muzzle animation reset');
 assert(html[k].includes('squadRemoteProjectileVisual(bullet,previous,targetX,targetY,nowMs,weight,myId)'),k+' visual calls helper');
}
assert(html.draft2.includes('id="mockGad2"')&&html.draft2.includes('id="gad2Size"')&&html.draft2.includes('DRAFT_GAD2_LAYOUT_KEY'),
 'GAD2 position, size and persistence only in new draft 2v2 trial');
assert(!html.oldNormal1.includes('remoteShotDrawPoint(')&&!html.oldNormal2.includes('squadRemoteProjectileVisual('),
 'original known-good normal public HTML must never be overwritten by readiness process');
console.log('PASS FOUR MODES: weapon/projectile/ability rules aligned, stats match, enemy muzzle visual parity across 4, GAD2 trial and old public HTML preserved');
