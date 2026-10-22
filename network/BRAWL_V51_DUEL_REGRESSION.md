# BRAWL V5.1｜以前安定した1vs1と共通基盤版の描画・同期比較

## 学校実機からの報告

- 学校iPad Safari + Google Sitesの通常1vs1でキャラがワープし、画面全体もカクついて遊べない。以前は安定していた。
- ユーザーは**開発基盤改善前は安定**していたと報告しており、基盤変更前後を回帰の探索軸にする。
- 10月13日の学校実機テストでは正常に対戦できた記録がある。現在学校に貼られているHTMLの正確なGit blobは未取得なので、ライブ埋め込みの版が変わったと断定しない。

## 静的調査

- `sites/BRAWL_FRIENDS_1vs1.html` のGit blobはmainと`stable/brawl-friends-2026-10-18`で完全一致：`2737ddf5ec2e32dc3a1be8cb320b90079739d433`。
- `shared/friends-online-modes.json` の最新生成1vs1はQA候補を入力とし、共通`controlLayout`と`duelPointerAim`/`duelTouchHandlers`/`duelActionButtons`を追加する。2vs2用V3.7〜V5.0の通信計測・位置更新・描画修正は1vs1に適用されない。
- 現行1vs1は80msごとに`/rooms/{ID}/positions/{role}`を更新し、古いsequenceを無視して補間する。推定位置と表示位置の距離が125ゲーム内単位を超えた場合だけ、描画上の相手を瞬間移動させる。コードの存在は確認したが、学校のワープ原因と断定しない。

## 追加検証

`tests/friends-1v1-stable-vs-shared-webkit-v51.cjs`をローカルFirebase RTDB Emulator上で実行する。**通常固定版**と**最新共通基盤生成版**をそれぞれ2つのWebKitページでルーム作成・参加・READYして実戦状態へ進め、二人が交互に動きながら撃つ。各ページのrAFフレーム分布（p95）、Canvas draw命令CPU（p95）、遠隔positionsパケット到着数、相手キャラのフレーム間ジャンプ最大値・45px超過件数、フレームギャップ100ms超過件数、JSエラーを匿名集計する。

静的回帰ガードとして、固定版と生成版の`sendPosition`・`getRemotePredicted`・`gameLoop`各関数コードは等しいことを必須にする。Firefox/ChromiumではなくWebKitを使う。

このCIは同じCIホスト上の2ブラウザ、ローカルFirebase、スタンドアロンHTMLであり、学校管理iPad・Google Sitesのiframe・実ネットワーク遅延の再現ではない。差がなければ他の原因の可能性が残る。

## 範囲

Google Sitesや本番Firebase/Rules/URL、公開HTML、Google Driveファイルを一切変更しない。版特定や学校テストが終わるまで通信間隔、HP、補間閾値、キャラバランスを安易に変えない。結果から因果関係を決める。
