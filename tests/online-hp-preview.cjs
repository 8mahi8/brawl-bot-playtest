// Standalone 2vs2 HTML: HUD-only hit prediction regression tests.
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const html=fs.readFileSync(path.join(__dirname,'../online/ipad-squad-v2-lab.html'),'utf8');
const names=['pruneHpPreviews','predictedEnemyHp','previewOwnBulletHit','reconcileHpPreviews'];
function extract(name){
 const re=new RegExp('function '+name+'\\([^\\n]*\\)\\{[\\s\\S]*?\\n\\}');
 const m=html.match(re);assert(m,'Extract exact source function '+name);return m[0];
}
const blocks=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(m=>m[1]).filter(Boolean);
for(const [i,b]of blocks.entries())new vm.Script(b,{filename:'squad inline script '+i});
assert(html.includes("hp:predictedEnemyHp()"),'HUD uses previews');
assert(html.includes("reconcileHpPreviews(before,game)"),'RTDB snapshot reconciles HP');
assert(html.includes("previewOwnBulletHit(b,p.id,BrawlProjectileV1.damage("),'locally rendered projectile triggers prediction');
assert(html.includes("if(!canSeeEnemy(pos,p.id))continue;"),'hidden players not leaked');
assert(!html.includes('ref.child("hpPreview")')&&!html.includes("room.child('hpPreview')"),'no new network writes');
function rig(){
 let now=1000;
 const context={
  console,Math,Number,performance:{now:()=>now},
  hpPreviewHits:[],HP_PREVIEW_TTL:1400,paused:false,solo:false,botPilot:false,myId:'shooter',
  game:{matchId:'match',round:1,phase:'playing',hp:{shooter:100,enemy:100},stats:{enemy:{life:1}}},
  canSeeEnemy:()=>true,targetPoint:()=>({x:10,y:10}),renderGameHUD:()=>{context.hudCalls++},hudCalls:0
 };
 vm.createContext(context);
 const script=names.map(extract).join('\n')+'\nthis.fx={pruneHpPreviews,predictedEnemyHp,previewOwnBulletHit,reconcileHpPreviews};';
 vm.runInContext(script,context);
 return{
  c:context,
  hit:(id,amount=12)=>context.fx.previewOwnBulletHit({id,owner:'shooter'},'enemy',amount),
  hp:()=>context.fx.predictedEnemyHp().enemy,
  pending:()=>context.hpPreviewHits.length,
  networkHP:()=>context.game.hp.enemy,
  nextSnapshot(value){const old=context.game;context.game={...old,hp:{...old.hp,enemy:value}};context.fx.reconcileHpPreviews(old,context.game)},
  advance:(ms)=>{now+=ms},
  round(){const old=context.game;context.game={...old,round:old.round+1};context.fx.reconcileHpPreviews(old,context.game)}
 };
}
let count=0;
function test(label,fn){fn();count++;console.log('PASS 2vs2 HP preview: '+label)}
test('immediate provisional enemy HP, actual game.hp unchanged',()=>{const r=rig();r.hit('shot:1');assert.equal(r.hp(),88);assert.equal(r.networkHP(),100);assert.equal(r.pending(),1)});
test('unrelated Firebase snapshot retains preview',()=>{const r=rig();r.hit('shot:1');r.nextSnapshot(100);assert.equal(r.hp(),88);assert.equal(r.pending(),1)});
test('server confirmation consumes predicted damage, no double subtract',()=>{const r=rig();r.hit('shot:1');r.nextSnapshot(88);assert.equal(r.hp(),88);assert.equal(r.pending(),0)});
test('partial server update consumes partial preview',()=>{const r=rig();r.hit('shot:1');r.nextSnapshot(95);assert.equal(r.hp(),88);assert.equal(r.pending(),1);r.nextSnapshot(88);assert.equal(r.hp(),88);assert.equal(r.pending(),0)});
test('multiple pellets add up',()=>{const r=rig();r.hit('1');r.hit('2');assert.equal(r.hp(),76);assert.equal(r.pending(),2)});
test('duplicate projectile not double-counted',()=>{const r=rig();r.hit('same');r.hit('same');assert.equal(r.hp(),88);assert.equal(r.pending(),1)});
test('preview cannot announce unconfirmed KO',()=>{const r=rig();r.hit('power',500);assert.equal(r.hp(),1);assert.equal(r.networkHP(),100)});
test('unconfirmed prediction expires',()=>{const r=rig();r.hit('shot');r.advance(1401);assert.equal(r.hp(),100);assert.equal(r.pending(),0)});
test('round change removes preview',()=>{const r=rig();r.hit('shot');r.round();assert.equal(r.pending(),0)});
test('server KO immediately clears preview',()=>{const r=rig();r.hit('shot');r.nextSnapshot(0);assert.equal(r.hp(),0);assert.equal(r.pending(),0)});
test('respawn life change removes preview',()=>{const r=rig();r.hit('shot');r.c.game.stats.enemy.life=2;assert.equal(r.hp(),100)});
test('hidden enemy not shown by preview',()=>{const r=rig();r.c.canSeeEnemy=()=>false;r.hit('shot');assert.equal(r.pending(),0);assert.equal(r.hp(),100)});
test('offline and BOT modes do not predict',()=>{const r=rig();r.c.solo=true;r.hit('shot');r.c.solo=false;r.c.botPilot=true;r.hit('shot2');assert.equal(r.pending(),0)});
test('other shooters cannot produce local prediction',()=>{const r=rig();r.c.fx.previewOwnBulletHit({id:'other',owner:'someoneElse'},'enemy',12);assert.equal(r.pending(),0)});
test('paused gameplay hides preview',()=>{const r=rig();r.hit('shot');r.c.paused=true;assert.equal(r.hp(),100)});
test('server healing cancels preview',()=>{const r=rig();r.nextSnapshot(90);r.hit('shot');r.nextSnapshot(92);assert.equal(r.hp(),92);assert.equal(r.pending(),0)});
console.log('PASS '+count+' HUD preview cases, '+blocks.length+' embedded JavaScript blocks parsed');
