// iPad Safari BOT edition, derived from unchanged Team Guard LAB.
// node scripts/build-ipad-safari.cjs --write | --check
'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),src=path.join(root,'foundation/2v2-open-arena-team-guard-lab.html'),dest=path.join(root,'foundation/2v2-ipad-safari.html');
const transforms=[
  {
    "key": "viewport",
    "from": "content=\"width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no\"",
    "to": "content=\"width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover\""
  },
  {
    "key": "title",
    "from": "<title>BRAWL 2vs2 | Team Guard LAB</title>",
    "to": "<title>BRAWL 2vs2 | iPad Safari</title>"
  },
  {
    "key": "fit storage",
    "from": "let fit=clamp(Number(safeLocalGet('brawl-v3-2v2-offline-fit-v1'))||100,40,100);",
    "to": "let fit=clamp(Number(safeLocalGet('brawl-ipad-safari-fit-v1'))||100,40,100);"
  },
  {
    "key": "dynamic height",
    "from": "function applyFit(){ $('app').style.height=fit+'%';",
    "to": "function applyFit(){ $('app').style.height=fit+'vh';$('app').style.height=fit+'dvh';"
  },
  {
    "key": "fit persist",
    "from": "safeLocalSet('brawl-v3-2v2-offline-fit-v1',fit);applyFit();",
    "to": "safeLocalSet('brawl-ipad-safari-fit-v1',fit);applyFit();"
  },
  {
    "key": "visual viewport",
    "from": "window.addEventListener('resize',()=>{pointer=null;aimPointer=null;ultPointer=null;applyLayout();});",
    "to": "window.addEventListener('resize',()=>{pointer=null;aimPointer=null;ultPointer=null;applyLayout();});window.visualViewport?.addEventListener('resize',()=>{pointer=null;aimPointer=null;ultPointer=null;applyLayout();});"
  },
  {
    "key": "QA flag",
    "from": "window.__brawlV3QA=()=>({teamGuardLab:true",
    "to": "window.__brawlV3QA=()=>({ipadReady:true,teamGuardLab:true"
  },
  {
    "key": "home tip",
    "from": "この公開版はBOT練習専用です。オンライン対戦とFirebase通信は無効化しています。",
    "to": "この公開版はBOT練習専用です。iPadはSafariで横向きにして遊んでね。ログインやインストールは不要。オンライン対戦とFirebase通信は無効化しています。"
  },
  {
    "key": "style",
    "from": "</style>",
    "to": "/* Dedicated iPad Safari viewport / touch edges. */\nhtml,body{height:100%;height:100dvh;overscroll-behavior:none}\n#app{height:100vh;height:100dvh}\n#arena,.battleAction{-webkit-touch-callout:none}\n#hud{top:max(7px,env(safe-area-inset-top));left:max(8px,env(safe-area-inset-left));right:max(8px,env(safe-area-inset-right))}\n#returnBtn,#skillInfoToggle,#fitButton,#moveHint{bottom:max(4px,env(safe-area-inset-bottom))}\n#skillInfoPanel{bottom:max(39px,calc(env(safe-area-inset-bottom) + 39px))}\n#botTools{bottom:max(48px,calc(env(safe-area-inset-bottom) + 48px))}\n#mapDock{right:max(9px,env(safe-area-inset-right));top:max(103px,calc(env(safe-area-inset-top) + 80px))}\n@media(max-width:500px){#mapDock{right:max(5px,env(safe-area-inset-right));top:max(93px,calc(env(safe-area-inset-top) + 80px))}}\n</style>"
  },
  {
    "key": "provenance",
    "from": "<!-- TEAM GUARD COMPARISON: generated from tank balance LAB;",
    "to": "<!-- iPAD SAFARI CANDIDATE: generated from Team Guard LAB; no battle-rules changes. -->\n<!-- TEAM GUARD COMPARISON: generated from tank balance LAB;"
  }
];
function render(base){let s=base;for(const t of transforms){assert.equal(s.split(t.from).length-1,1,'source anchor drift: '+t.key);s=s.replace(t.from,t.to);}return s;}
function main(arg){assert(['--write','--check'].includes(arg));const html=render(fs.readFileSync(src,'utf8'));
if(arg==='--write')fs.writeFileSync(dest,html);else assert.equal(fs.readFileSync(dest,'utf8'),html,'stale iPad Safari page');
console.log('PASS iPad Safari '+arg+' '+html.length);}
if(require.main===module)main(process.argv[2]);
module.exports={render,transforms,main};
