// BRAWL V4.0 — opt-in touch-friendly LOCAL diagnostics for staged 2v2.
// No new Firebase writes, network requests, persistence or timer by default.
(function(){
 'use strict';
 const primary=window.__brawlLagV39QA,secondary=window.__brawlLatencyV35QA;
 if(!primary||!secondary||document.getElementById('brawlV40Diagnostics'))return;
 const style=document.createElement('style');
 style.textContent=[
 '#brawlV40Diagnostics{position:fixed;z-index:2147483000;top:max(3px,env(safe-area-inset-top));left:50%;transform:translateX(-50%);font:12px system-ui,-apple-system,sans-serif;touch-action:manipulation;color:#e6f8ff;pointer-events:auto}',
 '#brawlV40Diagnostics button{min-width:0;min-height:32px;font:inherit;border:1px solid #618e9d;border-radius:9px;background:#122c3b;color:#e6f8ff;padding:5px 10px;touch-action:manipulation}',
 '#brawlV40Diagnostics #brawlV40Open{font-size:11px;opacity:.86;padding:3px 8px;min-height:25px;background:#09202acc}',
 '#brawlV40Diagnostics #brawlV40Open[data-running="true"]{border-color:#82e6ad;color:#b4ffe2}',
 '#brawlV40Diagnostics #brawlV40Panel{position:fixed;box-sizing:border-box;left:50%;top:32px;transform:translateX(-50%);width:min(450px,96vw);max-height:min(84dvh,520px);overflow-y:auto;-webkit-overflow-scrolling:touch;touch-action:pan-y;background:#081c2a;box-shadow:0 8px 26px #000b;border:1px solid #6793a3;padding:12px;border-radius:12px;white-space:normal}',
 '#brawlV40Diagnostics #brawlV40Panel[hidden]{display:none!important}',
 '#brawlV40Diagnostics #brawlV40Panel h3{margin:0 0 7px;font-size:15px}',
 '#brawlV40Diagnostics #brawlV40Panel p{margin:6px 0;font-size:12px;line-height:1.55;color:#bfd8e4;text-align:left}',
 '#brawlV40Diagnostics #brawlV40Panel .brawlV40Btns{display:flex;flex-wrap:wrap;gap:6px;margin:8px 0}',
 '#brawlV40Diagnostics #brawlV40Panel button:disabled{opacity:.4}',
 '#brawlV40Diagnostics #brawlV40Panel textarea{display:block;width:100%;height:140px;resize:vertical;padding:8px;border-radius:8px;border:1px solid #507589;background:#06131d;color:#edf9ff;font-size:12px;line-height:1.5;touch-action:pan-y;user-select:text;-webkit-user-select:text}',
 '#brawlV40Diagnostics #brawlV40Panel #brawlV40State{font-size:12px;color:#b8f0ce}'
 ].join('\n');
 document.head.appendChild(style);
 const root=document.createElement('div');root.id='brawlV40Diagnostics';
 const open=document.createElement('button');open.id='brawlV40Open';open.type='button';open.textContent='通信診断';
 const panel=document.createElement('section');panel.id='brawlV40Panel';panel.hidden=true;
 panel.setAttribute('aria-label','通信診断パネル');
 const title=document.createElement('h3');title.textContent='BRAWL 2vs2 通信診断';
 const guide=document.createElement('p');
 guide.textContent='対戦前に「計測開始」→ 友達と対戦 → 終わったら「停止・結果を見る」。この端末だけを計測します。';
 const note=document.createElement('p');
 note.textContent='Firebaseの接続速度そのものや真のpingを計るものではありません。ラグの原因を比較するための参考値です。';
 const buttons=document.createElement('div');buttons.className='brawlV40Btns';
 const makeButton=(id,label)=>{const b=document.createElement('button');b.type='button';b.id=id;b.textContent=label;buttons.appendChild(b);return b;};
 const start=makeButton('brawlV40Start','計測開始');
 const stop=makeButton('brawlV40Stop','停止・結果を見る');
 const copy=makeButton('brawlV40Copy','結果をコピー');
 const close=makeButton('brawlV40Close','閉じる');
 const status=document.createElement('div');status.id='brawlV40State';
 status.setAttribute('role','status');status.setAttribute('aria-live','polite');
 const result=document.createElement('textarea');result.id='brawlV40Result';
 result.readOnly=true;result.setAttribute('aria-label','計測結果（コピー可能）');
 result.placeholder='計測を停止すると、ここに匿名の集計値を表示します。';
 panel.append(title,guide,buttons,status,result,note);root.append(open,panel);document.body.appendChild(root);
 let lastText='';
 function reflect(message){
  const running=primary.status().running;
  open.dataset.running=String(running);
  open.textContent=running?'● 計測中':'通信診断';
  start.disabled=running;stop.disabled=!running;copy.disabled=!lastText;
  status.textContent=message||(running?'計測中。プレイ後に停止して結果を確認してね。':'未計測');
 }
 function line(title,r,k){
  const m=r.stages?.[k]||{},n=m.samples||0;
  return title+'：'+(n?('中央 '+m.p50Ms+'ms / 遅い側 '+m.p95Ms+'ms / '+n+'件'):'データなし');
 }
 function summary(r,frame){
  return [
   'BRAWL 2vs2 通信診断 V4.0（この端末の直近ラウンド）',
   '計測時間：約'+r.sampleSeconds+'秒',
   '送信した弾：'+r.events.localShots+' / 他人の弾の受信：'+r.events.remoteShots,
   line('Firebaseへの書き込み完了',r,'writeAckMs'),
   line('他人の弾・推定送信から受信まで',r,'remoteActionEstimatedAgeMs'),
   line('受信から弾の描画指示まで',r,'receiveToFirstVisualMs'),
   line('受信から発射受理の確定通知まで',r,'receiveToReceiptMs'),
   line('ホスト内の処理待ち',r,'hostQueueWaitMs'),
   line('ホストの戦闘状態書き込み',r,'hostTransactionMs'),
   line('自分の弾の送信から確定通知まで',r,'sendToReceiptMs'),
   'ホスト書き込み 成功 '+r.events.hostCommitted+' / 未確定 '+r.events.hostAborted,
   '画面フレーム：'+(frame?.presentation?.framesPerSecond??'測定なし')+'fps',
   '画面の100ms超過フレーム：'+(frame?.presentation?.frameGapsOver100ms??'測定なし')+'回',
   'Firebase game更新回数/秒：'+(frame?.traffic?.gameSnapshotsPerSecond??'測定なし'),
   '',
   '※ 推定送信→受信は時計の誤差を含む。pingではない。',
   '※ 描画は画面に映る直前の処理まで。実機の表示遅延は未測定。',
   '※ 異なるiPadの時間を直接足し合わせることはできません。',
   '※ 生のルーム番号、個人ID、端末情報は含めていません。'
  ].join('\n');
 }
 open.addEventListener('click',()=>{panel.hidden=!panel.hidden;if(!panel.hidden)reflect();});
 close.addEventListener('click',()=>{panel.hidden=true;});
 start.addEventListener('click',()=>{
  primary.start();secondary.start(250);
  lastText='';result.value='';reflect('計測中。診断画面を閉じて、普段どおり遊んでね。');panel.hidden=true;
 });
 stop.addEventListener('click',()=>{
  const latest=primary.stop(),frame=secondary.stop();
  lastText=summary(latest,frame);result.value=lastText;
  reflect(latest.hasSamples?'計測完了。結果は下からコピーできるよ。':
   '終了したけど弾のデータがまだ少ないよ。試合中に何度か射撃してね。');
  panel.hidden=false;
 });
 copy.addEventListener('click',async()=>{
  if(!lastText)return;
  try{
   if(!navigator.clipboard?.writeText)throw Error('Clipboard unavailable');
   await navigator.clipboard.writeText(lastText);reflect('結果をコピーできたよ。');
  }catch(_){
   result.focus();result.select();let copied=false;
   try{copied=!!document.execCommand?.('copy');}catch(_){}
   reflect(copied?'結果をコピーできたよ。':
    'コピーできない場合は、結果欄を長押しして全選択・コピーしてね。');
  }
 });
 reflect();
 window.__brawlLagV40UI=Object.freeze({
  version:'V4.0',status:()=>({running:primary.status().running,panelOpen:!panel.hidden,hasResult:!!lastText}),
  format:summary
 });
})();
