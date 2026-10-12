// New standalone 2vs2 role-design experiment: Tank GAD is a TEAM ability, not self-invulnerability.
// The user's approved wide map and prior 160HP tank lab are preserved unchanged.
// Usage: node scripts/build-team-guard-lab.cjs --write | --check
'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const dir=path.resolve(__dirname,'..');
const src=path.join(dir,'foundation/2v2-open-arena-tank-lab.html');
const dst=path.join(dir,'foundation/2v2-open-arena-team-guard-lab.html');
const MODIFICATIONS=[
  {
    "key": "guardian lookup",
    "from": "return st?.char==='tank'&&st.guardUntil>t&&g.hp[id]>0&&(id===h.victim||(st.guardTargetId===h.victim&&st.guardTargetLife===g.stats[h.victim].life));",
    "to": "return st?.char==='tank'&&st.guardUntil>t&&g.hp[id]>0&&id!==h.victim&&st.guardTargetId===h.victim&&st.guardTargetLife===g.stats[h.victim].life;"
  },
  {
    "key": "guardian HUD",
    "from": "if(source===id||st.guardTargetId===id&&st.guardTargetLife===game.stats?.[id]?.life)",
    "to": "if(source!==id&&st.guardTargetId===id&&st.guardTargetLife===game.stats?.[id]?.life)"
  },
  {
    "key": "ally range",
    "from": ".map(k=>({id:g.seats[k].id,d:Math.hypot(point(g,g.seats[k].id,input).x-pos.x,point(g,g.seats[k].id,input).y-pos.y)})).sort((x,y)=>x.d-y.d)[0];",
    "to": ".map(k=>({id:g.seats[k].id,d:Math.hypot(point(g,g.seats[k].id,input).x-pos.x,point(g,g.seats[k].id,input).y-pos.y)})).filter(v=>v.d<=260).sort((x,y)=>x.d-y.d)[0];"
  },
  {
    "key": "no ally guard",
    "from": "s.guardUntil=t+BrawlAbilityV1.guardianLinkMs;s.guardTargetId=ally?.id||'';",
    "to": "s.guardUntil=ally?t+BrawlAbilityV1.guardianLinkMs:0;s.guardTargetId=ally?.id||'';"
  },
  {
    "key": "player guide",
    "from": "ガーディアンリンク：前方ダッシュと同時に味方1人を3.2秒間守る。自分と味方への被ダメージを35%軽減。距離で途切れない。防いだ量も表示。",
    "to": "ガーディアンリンク：前方ダッシュ。発動時に260以内の味方がいれば、その1人の被ダメージを3.2秒間25%軽減。自分には軽減なし。味方がいなくてもダッシュできる。"
  },
  {
    "key": "menu title",
    "from": "<title>BRAWL 2vs2 | Tank Balance LAB</title>",
    "to": "<title>BRAWL 2vs2 | Team Guard LAB</title>"
  },
  {
    "key": "menu label",
    "from": "OPEN ARENA · TANK 160HP · GUARD 25% · COMPARE",
    "to": "OPEN ARENA · TANK SUPPORT ONLY · COMPARE"
  },
  {
    "key": "QA flag",
    "from": "window.__brawlV3QA=()=>({tankBalanceLab:true",
    "to": "window.__brawlV3QA=()=>({teamGuardLab:true,tankBalanceLab:true"
  },
  {
    "key": "provenance",
    "from": "<!-- TANK BALANCE COMPARISON: generated from Open Arena LAB;",
    "to": "<!-- TEAM GUARD COMPARISON: generated from tank balance LAB; do not edit manually. -->\n<!-- TANK BALANCE COMPARISON: generated from Open Arena LAB;"
  }
];
function buildTeamGuard(text){
 for(const item of MODIFICATIONS){const n=text.split(item.from).length-1;assert.equal(n,1,'Team guard LAB anchor drift: '+item.key);text=text.replace(item.from,item.to);}
 return text;
}
function main(flag){assert(['--check','--write'].includes(flag),'--write or --check');const built=buildTeamGuard(fs.readFileSync(src,'utf8'));
 if(flag==='--write')fs.writeFileSync(dst,built);else assert.equal(fs.readFileSync(dst,'utf8'),built,'team guard lab must match generator');
 console.log('PASS team guard LAB '+(flag==='--write'?'generated':'reproducible')+' ('+built.length+' chars)');}
if(require.main===module)main(process.argv[2]);
module.exports={buildTeamGuard,MODIFICATIONS,main};
