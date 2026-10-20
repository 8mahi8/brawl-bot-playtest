# BRAWL V4.6｜人工受信遅延なしの4人弾ラグ基準試験

2026-10-21。今回の変更は **CI / staging WebKit テストのみ**。学校向けGoogle Sites、本番Firebase URL・Rules・データ、公開用HTML、対戦ロジック、キャラバランスはいずれも変更しない。

## なぜ追加するか

V4.3の4人移動・射撃テストは、受信側 red1 に **意図的な180ms ACTION コールバック遅延** を入れていた。これは耐性テストには有効だが、普段の受信→初描画時間をそのまま表すデータにはできない。V4.5の同一CIホストに4Canvas対1Canvasを比較する実験でも、4人それぞれの端末間ネットワーク遅延を直接測定してはいない。

V4.6の `BRAWL_V46_BASELINE_ACTIONS=1` は、同じ既存試合ループ・ローカルFirebase Emulatorで**全員の人工コールバック遅延を0ms**にする。通常2vs2とドラフト2vs2の両方で4人全員が移動・射撃し、現在すでに生成HTMLが持っているV3.9診断を自発的に開始・停止する。録画・スクリーンショットの負荷を減らして自然なコールバック経路を観察し、元のV4.3動画テストはそのまま保持する。

## 保存する値

`artifacts/qa/v46-{normal,draft}-natural-shot-pipeline.json` に、各座席の匿名イベント件数・p50/p95/最大の段階別時間、ローカル `game` コールバックCPU時間、100ms超過フレームを保存する。ルーム番号、player ID、Firebase認証情報、action ID、弾の座標は含めない。CIログには比較しやすいp95だけをコンパクトに出す。

段階は既存V3.9の `writeAckMs`、`receiveToFirstVisualMs`、`receiveToReceiptMs`、`hostQueueWaitMs`、`hostTransactionMs` など。送信側の`writeAckMs`はFirebase SDKのPromise待ちであり、ネットワークRTTと同義ではない。受信側の`receiveToFirstVisualMs`もCanvas描画命令までで、物理ディスプレイ表示ではない。

## 正しい判断のための注意

- 4ブラウザとFirebase Emulatorが**同じGitHub Actionsマシン**で動くため、CIのFPSを学校iPadに当てはめない。
- `performance.now()` は同一端末の区間測定専用。別端末の時刻差を足さない。V3.9の推定ACTION ageは時計誤差を含みRTTではない。
- V4.6では通信方式やホスト権限は変えず、既存のACTION書込→ホスト`game.transaction()`→ゲーム状態通知→弾描画を測るだけ。
- 実機で不快な「弾だけ遅い」の再現性と原因を確定するには、4人の学校iPadで診断を実行した数値と体感が必要。
- 結果を比較して初めて、通信経路・ホスト側待ち・Canvasのどこを最適化するか選ぶ。HUD集約はV4.5通り標準では無効。

参考: [Firebase公式RTDB性能最適化](https://firebase.google.com/docs/database/usage/optimize) / [公式Web read/write](https://firebase.google.com/docs/database/web/read-and-write) / [MDN requestAnimationFrame](https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame)

## 検証基準

1. `node --check tests/friends-2v2-live-motion-webkit-v43.cjs` 成功。
2. 通常・ドラフトそれぞれ4人が実際に移動し発射。全席がremote ACTION受信、WebKitページ例外なし。
3. 既存の意図的180ms遅延試験、4Canvas対1Canvas比較、Foundation/Combatスモークも維持。
4. CIでV4.6 JSONの実値とp95をレビューするまで、ボトルネック判定・「ラグ解消」宣言は禁止。
