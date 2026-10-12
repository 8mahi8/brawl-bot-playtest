// BRAWL developer foundation: build self-contained 1vs1 + 2vs2 HTML
// from ONE shared stat/balance contract while preserving mode-specific runtimes.
// Usage: node scripts/build-brawl.cjs --write | --check
'use strict';
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const contract=JSON.parse(read('shared/brawl-core-contract.json'));
const settings=JSON.parse(read('shared/brawl-build-modes.json'));
const literal=x=>typeof x==='number'?String(x):JSON.stringify(x);

function replaceUnique(text,regexp,replacement,label){
 const matches=[...text.matchAll(new RegExp(regexp.source,regexp.flags.includes('g')?regexp.flags:regexp.flags+'g'))];
 assert.equal(matches.length,1,'build anchor drift: '+label+' (found '+matches.length+')');
 return text.replace(regexp,replacement);
}
function renderBalance(mode){
 const b={...contract.common.balance,...settings.sharedModeBalance,areaRadius:mode.areaRadius};
 for(const [key,value]of Object.entries({
  regenDelayMs:contract.common.regenDelayMs,
  regenFractionPerSecond:contract.common.regenFractionPerSecond,
  gasDelayMs:contract.common.gasDelayMs,
  gasSpeed:contract.common.gasSpeed,
  gunnerBurstNormalMs:contract.common.gunnerBurstNormalMs,
  gunnerBurstOverdriveMs:contract.common.gunnerBurstOverdriveMs,
  ultGainDealt:contract.common.ultGainDealt,
  ultGainTakenDefault:contract.common.ultGainTakenDefault,
  ultGainTakenTank:contract.common.ultGainTakenTank
 }))b[key]=value;
 const entries=Object.entries(b).map(([key,value])=>'  '+key+':'+literal(value));
 return 'const BALANCE={\n'+entries.join(',\n')+'\n };';
}
function renderCharacters(mode){
 const sections=[];
 for(const id of mode.characterOrder){
  const spec=contract.common.characters[id],display=settings.characterDisplay[id];
  assert(spec&&display,'unknown character '+id);
  const reload=mode.originalReloadUnit==='seconds'?spec.reloadMs/1000:Math.round(spec.reloadMs);
  const vars={
   label:display.label,
   hp:spec.hp,
   speed:contract.common.movementSpeed,
   color:display.color,
   range:id==='tank'?'BALANCE.tankFalloffEnd':id==='bomber'?'BALANCE.bomberRange':spec.range,
   damage:id==='tank'?'BALANCE.tankNearDamage':id==='bomber'?'BALANCE.bomberDamage':spec.baseDamage,
   reload
  };
  Object.assign(vars,mode.characterExtras[id]||{});
  const pairs=Object.entries(vars).map(([key,val])=>key+':'+(typeof val==='string'&&val.startsWith('BALANCE.')?val:literal(val)));
  sections.push('  '+id+':{'+pairs.join(',')+'}');
 }
 return 'const CHARS={\n'+sections.join(',\n')+'\n };';
}
function render(modeName,sourceOverride=null,contractOverride=null){
 // contractOverride is used only in tests proving a single change propagates to both.
 const mode=settings.modes[modeName];assert(mode,'unknown mode '+modeName);
 const source=sourceOverride===null?read(mode.template):sourceOverride;
 const current=contractOverride||contract;
 const c=contractOverride?current:contract;
 // Dependency override stays in local pure builder inputs and never mutates the contract file.
 const balanceRender=contractOverride?buildBalanceOverride(mode,c):renderBalance(mode);
 const charactersRender=contractOverride?buildCharacterOverride(mode,c):renderCharacters(mode);
 let html=replaceUnique(source,/const BALANCE=\{[\s\S]*?\n \};/,balanceRender,modeName+' BALANCE');
 html=replaceUnique(html,/const CHARS\s*=\s*\{[\s\S]*?\};/,charactersRender,modeName+' CHARS');

 // The shared weapon rules are emitted once inside each standalone game.
 // Both the legacy 1vs1 event stream and the host-owned 2vs2 reducer use this API.
 const w=c.common.weaponRules;
 const weaponSource=read('shared/runtime/weapon-rules.inc.js');
 const tokens={
  __TANK_SPREAD__:JSON.stringify(w.tankSpread),
  __GUNNER_SPREAD__:JSON.stringify(w.gunnerSpread),
  __GUNNER_BURST_OVERDRIVE_MS__:String(c.common.gunnerBurstOverdriveMs),
  __GUNNER_BURST_NORMAL_MS__:String(c.common.gunnerBurstNormalMs),
  __GUNNER_RELOAD_MS__:String(w.gunnerOverdriveReloadMs),
  __SNIPER_KNOCKBACK__:String(w.sniperGadgetKnockback),
  __BULLET_SPEED__:String(w.bulletSpeed)
 };
 let baked=weaponSource;
 for(const [k,v]of Object.entries(tokens)){
  assert(baked.includes(k),'missing weapon token '+k);
  baked=baked.replaceAll(k,v);
 }
 assert(!/__\w+__/.test(baked),'unexpanded weapon rules tokens');
 html=replaceUnique(html,/\/\* END COMBAT CORE \*\//,
  '/* END COMBAT CORE */\n/* BEGIN SHARED WEAPON RULES */\n'+baked.trimEnd()+'\n/* END SHARED WEAPON RULES */',modeName+' weapon rules');

 // These functions are genuinely shared runtime code, inlined into both builds.
 // The two source templates may render them differently, but cannot implement
 // two different damage curves or hidden-actor detection rules.
 const inlineShared=[
  ['COMBAT_PRIMITIVES',/ const clamp=\(n,a,b\)=>[^\n]*\n const tankDamage=d=>[^\n]*\n const jumpDuration=d=>[^\n]*/,'shared/runtime/combat-primitives.inc.js'],
  ['STEALTH_VISIBILITY',/ function state\(\{viewer,target,concealed,revealedUntil=0,now=0\}\)\{[\s\S]*?\n \}\n function visible\(args\)\{[^\n]*\}/,'shared/runtime/stealth-visibility.inc.js']
 ];
 for(const [label,anchor,sourcePath]of inlineShared){
  const replacement=' /* BEGIN SHARED RUNTIME '+label+' */\n'+read(sourcePath).trimEnd()+'\n /* END SHARED RUNTIME '+label+' */';
  html=replaceUnique(html,anchor,replacement,modeName+' '+label);
 }


 // A single projectile integrator is used by the 1vs1 legacy renderer and both reducers.
 // Inline it after weapon rules; game files remain standalone for strict CSP environments.
 html=replaceUnique(html,/\/\* END SHARED WEAPON RULES \*\//,
  '/* END SHARED WEAPON RULES */\n/* BEGIN SHARED PROJECTILE PHYSICS */\n'+read('shared/runtime/projectile-physics.inc.js').trimEnd()+'\n/* END SHARED PROJECTILE PHYSICS */',modeName+' projectile physics');

 // Move identical authoritative ammo and burst functions into a single source file.
 // These are scoped inside the V8.create() closure and become available to both modes.
 const actionsSource=read('shared/runtime/combat-actions.inc.js').trimEnd();
 // Remove the template's duplicate BEFORE inserting the shared source:
 // otherwise this regex can consume the newly inserted burst + initialize().
 html=replaceUnique(html,/  function burst\(a,s,g\)\{[\s\S]*?\n  \}\n  function flying\(/,
  '  function flying(',modeName+' remove duplicated burst');
 html=replaceUnique(html,/  function ammo\(s,t\)\{[\s\S]*?\n  \}\n  function initialize\(/,
  ' /* BEGIN SHARED RUNTIME COMBAT_ACTIONS */\n'+actionsSource+'\n /* END SHARED RUNTIME COMBAT_ACTIONS */\n  function initialize(',modeName+' ammo actions');
 html=replaceUnique(html,/<title>[^<]*<\/title>/,'<title>BRAWL '+modeName+' | Shared Foundation V1</title>',modeName+' title');
 html=replaceUnique(html,/<!DOCTYPE html>/i,'<!DOCTYPE html>\n<!-- GENERATED BY scripts/build-brawl.cjs; EDIT THE SHARED CONTRACT OR SOURCE TEMPLATE, NOT THIS FILE. MODE: '+modeName+'. Standalone; retains original CSP. -->',modeName+' doctype');
 assert.equal((html.match(/function initialize\(/g)||[]).length,1,'required reducer initialize present '+modeName);
 assert.equal((html.match(/function ammo\(s,t\)/g)||[]).length,1,'shared reducer ammo exactly once '+modeName);
 assert.equal((html.match(/function burst\(a,s,g\)/g)||[]).length,1,'shared reducer burst exactly once '+modeName);
 assert.equal((html.match(/<script>/g)||[]).length,1,'single inline script '+modeName);
 assert(!/<script\b[^>]*\bsrc\s*=/.test(html),'remote scripts forbidden '+modeName);
 assert(html.includes("script-src 'unsafe-inline'"),'expected standalone-safe CSP '+modeName);
 new (require('node:vm').Script)(html.match(/<script>([\s\S]*?)<\/script>/)[1],{filename:mode.output});
 return html;
}
function buildBalanceOverride(mode,c){
 const b={...c.common.balance,...settings.sharedModeBalance,areaRadius:mode.areaRadius,
  regenDelayMs:c.common.regenDelayMs,regenFractionPerSecond:c.common.regenFractionPerSecond,
  gasDelayMs:c.common.gasDelayMs,gasSpeed:c.common.gasSpeed,
  gunnerBurstNormalMs:c.common.gunnerBurstNormalMs,gunnerBurstOverdriveMs:c.common.gunnerBurstOverdriveMs,
  ultGainDealt:c.common.ultGainDealt,ultGainTakenDefault:c.common.ultGainTakenDefault,ultGainTakenTank:c.common.ultGainTakenTank};
 return 'const BALANCE={\n'+Object.entries(b).map(([k,v])=>'  '+k+':'+literal(v)).join(',\n')+'\n };';
}
function buildCharacterOverride(mode,c){
 const chunks=mode.characterOrder.map(id=>{
  const spec=c.common.characters[id],display=settings.characterDisplay[id];
  const values={label:display.label,hp:spec.hp,speed:c.common.movementSpeed,color:display.color,
   range:id==='tank'?'BALANCE.tankFalloffEnd':id==='bomber'?'BALANCE.bomberRange':spec.range,
   damage:id==='tank'?'BALANCE.tankNearDamage':id==='bomber'?'BALANCE.bomberDamage':spec.baseDamage,
   reload:mode.originalReloadUnit==='seconds'?spec.reloadMs/1000:Math.round(spec.reloadMs),
   ...(mode.characterExtras[id]||{})};
  return '  '+id+':{'+Object.entries(values).map(([k,v])=>k+':'+(typeof v==='string'&&v.startsWith('BALANCE.')?v:literal(v))).join(',')+'}';
 });
 return 'const CHARS={\n'+chunks.join(',\n')+'\n };';
}
function main(command){
 assert(['--write','--check'].includes(command),'use --write or --check (no implicit rewrites)');
 const failures=[];
 for(const [name,mode]of Object.entries(settings.modes)){
  const output=render(name),target=path.join(root,mode.output);
  if(command==='--write'){fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,output);console.log('BUILD '+name+' -> '+mode.output+' ('+output.length+' chars)');}
  else if(!fs.existsSync(target)||fs.readFileSync(target,'utf8')!==output)failures.push(mode.output);
  else console.log('PASS reproducible standalone '+name+' -> '+mode.output);
 }
 if(failures.length)throw Error('Stale or missing generated pages: '+failures.join(', ')+'; run node scripts/build-brawl.cjs --write and commit both outputs.');
 if(command==='--check')console.log('PASS both generated pages are byte-for-byte reproducible');
}
if(require.main===module)main(process.argv[2]);
module.exports={render,main,contract,settings};
