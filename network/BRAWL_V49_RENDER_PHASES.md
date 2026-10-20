# BRAWL V4.9 — 2vs2 ACTION→rAF→Canvasを区間分割して検証

目的：相手の弾の受信後の見た目の待ち時間を、通信配送ではなく**同じ端末のrAFとCanvas描画待ち**に分けて説明する。既存V3.9のreceive→firstVisualだけでは何が遅いか判別しにくい。V4.8の静止Canvas起床対策後の確認を行う。

## 実施方法

- 変更は `tests/support/friends-2v2-render-phases-v49.js`、正確な注入アンカー、WebKit試験、CIのみ。実装はテスト専用、デフォルトビルド無変更。
- `BRAWL_V46_BASELINE_ACTIONS=1 BRAWL_V49_RENDER_PHASES=1` で通常・ドラフト2vs2を実行する。4人がそれぞれ27秒間移動・射撃。Firebaseは127.0.0.1:9000ローカルEmulatorのみ、人工ACTION遅延無し。動画録画・スクリーンショットを無効にして測定。
- 実際のACTION処理に受信マーク、既存requestAnimationFrameコールバックにフレーム開始マーク、shouldDrawCanvasFrame()の既存true/false戻り値に描画選択マーク、早期弾/ボマー/確定弾に最初のCanvas表示命令マークを試験HTMLだけ追加。
- 同じperformance.now()で「受信→次rAF」「最初のrAF→最初の描画許可」「受信→初Canvas許可」「受信→実弾描画命令」「最初のrAF→弾描画」を匿名集計。p50/p95/maxとサンプル数、未描画ACTION数も保存。
- 4ブラウザは同じGitHub Actions CIマシン上で動くため、得られる時間は学校のネットワークRTTや単一iPad FPSではない。

## 注意事項

- Canvasへの描画命令が発行された時刻を測定するものであり、物理ディスプレイ表示時刻は測っていない。
- nextCanvasDrawはCanvasを描いた最初のフレームであり、そのフレームで当該弾が見えたことを保証しない。弾の可視性はfirstVisualを別に評価する。
- 結果は描画された弾だけの条件付き統計になり得るため、未描画件数とサンプル数を明記する。端末時計同士の差は計算しない。
- Firebaseの設定・Rules・URL、Google Sites、公開HTML、Drive、当たり判定、ホストの権限、ゲームバランスは一切変更しない。

## 判断

rAF待ちが大きい場合はCIマシンの4ブラウザ負荷と分離した1クライアント描画の評価へ。rAF到着後の待ちが大きい場合は先行弾の描画・ホスト確定との競合を調査する。分布が小さくても学校で改善したとは断定しない。

参考資料： [MDN requestAnimationFrame](https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame)、[Firebase Realtime Database Read and Write](https://firebase.google.com/docs/database/web/read-and-write)。
