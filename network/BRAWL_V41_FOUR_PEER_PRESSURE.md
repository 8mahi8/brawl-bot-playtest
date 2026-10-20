# BRAWL V4.1｜2vs2の4人同時射撃・通信負荷分析

対象：開発用の通常/ドラフト2vs2共通のアクション処理。2026-10-20。Google Sites公開HTML、実Firebase、本番Rules、Driveは変更していない。

## 外部資料

- Firebase公式：Realtime Databaseのパフォーマンス最適化 https://firebase.google.com/docs/database/usage/optimize — 読み取り場所を限定し、購読するデータと頻度を検証する。
- Firebase公式：Web SDKの読み書き https://firebase.google.com/docs/database/web/read-and-write — value リスナーは子孫の更新ごとに発火し、その位置のスナップショット全体を返す。
- Gaffer On Games：Snapshot Compression https://www.gafferongames.com/post/snapshot_compression/ — 頻繁な状態配信は帯域とフレーム進行にトレードオフがある。記事のUDP値をFirebaseにそのまま適用しない。

## V4.1 WebKit＋ローカルFirebase Emulator高負荷テスト

4つのSafari系WebKitブラウザが同じ1ルームで実際のRTDB emulatorに接続。6波×4人の発射操作（合計24回）を実行。ホストは19発を受理し、各端末は対戦状態を維持した。

- 計測窓：約3.6秒。各端末のgameスナップショットは65回（約18回/秒）、positionsは50回（約14回/秒）。
- gameスナップショットのJSON化サイズ目安：平均約6.1KB、最大約11.8KB。positions：平均約808B。
- ホストのgameトランザクション：11回、中央値41ms、p95 55ms。ホストのアクションキュー待ち：19件、中央値11ms、p95 31ms。
- 自分の発射から発射受理確認まで：送信者ごとの中央値68〜89ms、p95 95〜136ms。
- 他人の発射情報の受信時刻の概算：0ms遅延プロフィールでは中央値17〜37ms。180ms／350msの人為的ACTIONリスナー遅延では中央値199ms／375ms。

**重要な限界：** JSON化サイズはゲーム状態のブラウザ内表現に基づく目安であり、Firebase SDKのネットワーク上の差分転送量、通信料金、実際の学校Wi-FiでのRTTではない。4クライアントが同じローカルマシン上で動作しており、値は端末負荷と学校回線を再現していない。対戦を長時間続けたときの信頼区間も未確定。証拠ファイル：CI artifact内の `artifacts/qa/v41-four-peer-game-pressure.json`。

## 今回の変更（通常・ドラフトの2vs2開発版のみ）

`shared/runtime/friends-2v2-action-stream.inc.js` の `drainActions()` を軽量化。

- 位置/ゲームの更新に引っ張られ、待機中のアクションが0件でも走っていた確認ループ・配列コピー・sortを早期スキップ。既存のホスト送信スケジューラ呼出は維持。
- ゲスト端末では「受理済みアクションを取り除く」だけなので毎回sortしない。**ホスト側だけ**owner+seq順の決定的な並べ替えをそのまま維持。
- アクションプロトコル、権威ある命中判定、通信書込み頻度、ゲームルールは変更していない。1vs1にも影響しない。

検証：`tests/friends-2v2-action-hotpath-v41.cjs` がホスト順序とゲスト受理除去/待機ゼロのケースをテスト。`tests/friends-2v2-four-peer-pressure-v41.cjs` が4人ブラウザ接続と連続射撃を実行。既存の2人/4人/ドラフト/タッチ/遅延挿入テストも維持。

## 次の判断

今回のデータで**学校のラグの主因が確定したわけではない**。ただ、game状態の更新通知が多いこと、共有する状態が数KBあることは確認できた。将来の改善候補は(1)スナップショット処理の再実行を減らす、(2)必要に応じてゲーム状態の購読範囲を分離する、(3)学校iPadでV4.0通信診断を測る。Firebaseの通信経路・命中判定・Roomsプロトコルの大規模変更は、学校の実測を得るまで保留。
