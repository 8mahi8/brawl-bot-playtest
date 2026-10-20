# BRAWL V4.0｜学校iPadで2vs2の弾ラグを測る

2026-10-20。対象：通常2vs2・ドラフト2vs2の生成された開発用HTMLだけ。現行Google Sites公開ページ、正式sites版、実Firebase設定・Rules・データは変更していない。

## iPadの操作（Safari / Google Sites）

1. テスト用HTMLをGoogle Sitesに貼る（ユーザーが明示的に公開するときだけ）。通常とドラフトの2vs2両方に「通信診断」ボタンが付く。
2. 試合前、画面上端の小さい「通信診断」→「計測開始」を押し、閉じた状態で4人で対戦。押さない限り計測しない。
3. 10〜30秒程度プレイヤー同士で普通に弾を撃つ。計測によって対戦ルールは変更されない。
4. 「● 計測中」→「停止・結果を見る」。表示結果を「結果をコピー」でクリップボードへ。Safariの権限で失敗するときは結果欄を長押し→全選択→コピー。
5. できればホスト側1人とゲスト側1人で測定し、匿名の集計値を比較。ルーム番号やplayer IDは結果に含まれない。

## 計測の読み方

- 「Firebaseへの書き込み完了」：送信側SDKの書き込みが終わるまで。サーバー→相手iPadまでの通信遅延ではない。
- 「他人の弾・推定送信から受信まで」：serverNow() - action.at。時計のずれを含み、ping/RTTではない。
- 「受信から弾の描画指示まで」：JSの発射情報受信からCanvas描画指示まで。同端末時間。負の値は確定弾の表示が先行した可能性を示す。
- 「受信から発射受理の確定通知まで」：戦闘状態に発射受理の記録が現れるまで。ダメージの確定ではない。
- 「ホスト内の処理待ち」：ホスト端末内でキュー登録から戦闘計算開始まで。
- 「ホストの戦闘状態書き込み」：Firebase gameトランザクションPromise完了まで。競合や再試行の影響を含む場合がある。
- 「自分の弾の送信から確定通知まで」：送信側端末内の送信から受理確認まで。端末間の値を足さない。
- 「画面フレーム」「100ms超過フレーム」：Canvas処理の負荷のヒント。物理ディスプレイ遅延の直接測定ではない。

**V3.9計測はラウンドが変わると集計をリセットするため、表示は主に直近ラウンドの値。V3.5の描画統計は計測期間全体。**

## 参考にした外部資料

- Firebase公式 Performance optimization https://firebase.google.com/docs/database/usage/optimize ：購読効率・データ構造を見直す前に実測する
- Firebase公式 Monitor database performance https://firebase.google.com/docs/database/usage/monitor-performance ：Usage画面はネットワークRTTや端末描画の直接証拠ではない
- Gaffer On Games Networked Physics https://new.gafferongames.com/post/networked_physics_2004/ ：ローカル予測、権威ある確定、補間の役割を分ける

## 検証

- tests/friends-2v2-lag-panel-v40.cjs：ユーザー操作まで計測開始しないこと、匿名集計、コピー、2vs2のみの生成を検査。
- tests/friends-2v2-lag-delivery-webkit-v36.cjs：4人WebKit／ローカルFirebase Emulatorで診断開始→発射→結果確認、匿名の artifacts/qa/v40-four-peer-shot-pipeline.json を生成。
- 疑似的な180/350ms ACTIONコールバック遅延は実ネットワーク遅延・Firebaseのping測定ではない。

## 次の判断

実機の2vs2匿名集計を基に、(A)書込みとACTION到着、(B)ホストトランザクション待ち、(C)描画という順で切り分ける。原因特定前にFirebaseを別方式へ移行しない。Google Sitesの貼付け・Drive保存はユーザーから明示的に依頼されたときだけ。
