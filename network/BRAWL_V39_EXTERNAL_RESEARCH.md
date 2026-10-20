# BRAWL V3.9｜2vs2の通信ラグ分析：外部資料と検証方針

調査日：2026-10-20。対象：Google Sites内の学校iPad Safari、友達4人オンライン。**この文書は原因が判明したという意味ではない。**

## 資料と実装上の示唆

1. Firebase公式：Realtime Database **Optimize Database Performance**
   https://firebase.google.com/docs/database/usage/optimize
   - Listener・ダウンロード頻度・同期先を実測し、問題箇所を特定してから変更する。BRAWLは `rooms2v2/<room>/game` の大きい状態購読と、`actions` の個別イベントで負荷性質が異なる。
2. Firebase公式：**Read and Write Data on the Web**
   https://firebase.google.com/docs/database/web/read-and-write
   - トランザクションは競合時に更新関数が再実行され得る。BRAWLのホストは `game.transaction()` で戦闘を確定しているため、遅延を単なる「サーバーの速さ」と断定できない。
3. Firebase公式：**Profile Your Database**
   https://firebase.google.com/docs/database/usage/profile
   - サーバー側オペレーション時間とクライアント体感は同じではない。プロファイラの帯域推定は通信全量や料金の確定値ではない。
4. Glenn Fiedler / Gaffer On Games：**Networked Physics**
   https://gafferongames.com/post/networked_physics_2004/
   - 操作者は入力をローカル予測、確定した状態を後で補正。BRAWLの自分の弾と他人の弾、HP確定を分けて検討。
5. Gaffer On Games：**Snapshot Interpolation**
   https://new.gafferongames.com/post/snapshot_interpolation/
   - 補間を増やし過ぎると待ち時間も増える。追加の135ms巻き戻しをV3.8で除いたが、学校で解消したかはまだ未知。
6. Gaffer On Games：**Client Server Connection**
   https://new.gafferongames.com/post/client_server_connection/
   - 対戦の更新経路は一般アプリのDB同期と要求が違う。ただしBRAWLを直ちにWebRTC/UDPに変える根拠にはならない。

## BRAWLの現在の経路と検証したい仮説

`shootAngle() → submitAction() → RTDB actions/set → host listener → host queue → game.transaction() → client game snapshot → canvas`。

- A: 端末→Firebaseへのアップリンクで遅延している（ブラウザの `set()` 完了時間を計る。ただし真のRTTではない）。
- B: ACTIONは届いているが、ホスト側の処理待ち・トランザクションが遅れている（同一ホスト端末のキュー待ち・処理時間を計る）。
- C: ACTION/ゲーム確定は十分速いが、他端末の弾描画が遅れている（受信コールバック→初描画の同一端末時間を計る）。
- D: 実際には `game` snapshot の再送量・更新頻度が問題（V3.5既存プローブのsnapshot count、frameGap、draw costsと合わせて判断）。
- E: 学校ネットワーク固有の不安定さ（エミュレータで合格しても実機再現するか比較）。

## V3.9 staging専用の計測

- `writeAckMs`: 同じブラウザ内で発射送信からFirebase SDK `set()` Promise成功まで。
- `remoteActionEstimatedAgeMs`: 受信時の `serverNow()-action.at`。**これは真のping/RTTではなく、端末時計・offset推定に依存する概算**。
- `receiveToFirstVisualMs`: 同じ受信側でACTION受信から最初のcanvas描画指示まで。ACTIONより公式projectile表示が先の場合は負値となり得る。
- `receiveToReceiptMs`: 同じ受信側でACTION受信からauthoritative `game.usedActions` 確認まで。
- `hostQueueWaitMs`: ホストのキュー登録から処理開始まで。
- `hostTransactionMs`: ホストのFirebase `game.transaction()` Promise完了までの処理時間。
- `sendToReceiptMs`: 発射端末内で送信から確定受信まで。

報告はp50/p95/最大値と件数だけ。イベントID・player ID・room ID・座標やFirebase認証情報は報告しない。生のイベントキーはセッション中の有限メモリ内のみ、`stop()` 後に消去。**計測用の追加通信・DBへの書き込み・自動タイマーなし。**

開発用API：生成した2vs2ステージングHTMLの試合中に `window.__brawlLagV39QA.start()` → 対戦 → `window.__brawlLagV39QA.stop()`。同時に従来の `window.__brawlLatencyV35QA` も使える。学校のiPadで手軽に採取するUIは今後の別検討とする。

## 次に判断すること

1. CIローカル4人WebKitで基準データを採り、増減を比較。
2. 実機の通常・ドラフト2vs2で画面が詰まるか／弾だけ遅れるかを収集。
3. トランザクションが主因なら競合・ホスト書込を改善。描画ならCanvas描画パイプラインを改善。ACTION到達自体が遅い場合は転送方式の再検討。
4. どの段階でも `game` の権威、HP確定、ルームの隔離、BOT、既存のGoogle Sites公開版を不用意に変更しない。

**未測定のためネットワーク遅延、描画遅延、Firebaseのサーバー所在地のどれが主因とも断定しない。**
