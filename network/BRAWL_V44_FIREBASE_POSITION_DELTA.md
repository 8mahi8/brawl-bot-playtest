# BRAWL V4.4｜Firebaseを維持した位置情報の差分購読

## 目的と現時点の判定

学校iPadでは既存のFirebase RTDB方式が接続できている一方、新たに試したCloudflare WorkerのHTTPS/WebSocketは学校のGoogle Sites埋め込み内で失敗した。したがって **Cloudflare移行を進めず、現在のFirebaseルーム・Firebase Rules・5桁ルーム番号・4モードを維持**。

Firebase公式： [Optimize Database Performance](https://firebase.google.com/docs/database/usage/optimize) の「効率的なリスナー」「購読先を必要な位置に置く」と、[Read and Write Data on the Web](https://firebase.google.com/docs/database/web/read-and-write) の value / child_added / child_changed / child_removed の使い分けを参考にする。

### 変更前と変更後

- **V4.3まで：** `rooms2v2/{id}/positions` に `value` リスナー。4人のうち誰か1人が位置を更新するたび、JS callbackは4人分の位置オブジェクトを取得・再構築してから全件走査。
- **V4.4開発版：** 位置パスに `child_added` / `child_changed` / `child_removed` を登録。位置変更時には **更新された1人のオブジェクト** だけを取り出し、変わった内容をローカルキャッシュに反映。初回接続時のみ `once('value')` で位置配列の取得完了を確認し、初期ロードの途中に届いた更新が古い初期値で巻き戻されないようガードする。
- **受信CPUも改善：** child更新時の `ingestPositions(id)` は変更された1人だけ検証・更新する。初回・ラウンド切替・ロビー/在席情報更新では引き続き全員分の状態を再確認する。
- **変更なし：** 送信間隔80ms（移動中）・500ms（停止中）、Firebaseへの書き込み、戦闘のホスト判定、命中/HP・ゲームルール、公開中Google Sites。通常2vs2とドラフト2vs2の **生成する開発HTMLだけ** に反映。1vs1は不変。
- `child_removed` により、退出した遠隔プレイヤーのキャッシュが残る「幽霊表示」も削除。RTDB再接続/ラウンド更新時にseqを再利用しても以前の状態と混同しない。

## なぜ速くなる可能性があるのか

ブラウザが各位置通知で扱うJSオブジェクトを4人分から1人分へ削減できる。SDK側で既に差分転送が行われる場合もあるので、**通信パケットやFirebase料金が4分の1になるとは言えない**。本当の効果は、同一iPadでのJS CPU負荷、フレーム間隔、2vs2の弾の到着順序がどう変化するかを比較して判断する。

V4.1の4人負荷試験では、game全体の更新通知が1端末につき約18回/秒発生したが、ゲームstateとpositionsは別の購読であり、位置更新を変えるだけでゲームのトランザクション遅延が改善するとは断定できない。

## テスト範囲

- `tests/friends-2v2-position-delta-v44.cjs` : 初期化中の更新/削除と`once('value')`の競合、古いseq、再接続・ラウンド切替、子削除、古いRoom世代からの遅延応答、4モード分離。
- 既存のWebKit+ローカルFirebase Emulator : 4人参加・READY・移動/射撃・ラウンド更新、通常2vs2/ドラフト2vs2、遅延を挿入したACTION、弾・HP・BOTなど従来の自動テスト。
- `tests/friends-2v2-four-peer-pressure-v41.cjs` : V4.4以降、positionsのサイズは **childのJSON目安** として集計。従来の **subtreeのJSON全体** の数値と意味が異なる。実際の転送量・ネットワークパケットではない。
- 診断 `window.__brawlPositionV44QA()` はローカルの集計値のみ。room ID / player IDは出力しない。計測のためのFirebase書き込みや外部送信は追加しない。

## 受け入れと今後

全テストが合格しても「学校での弾ラグ解消」を宣言しない。学校iPadでGoogle Sites貼り付け版を更新するかはユーザーの依頼があった時のみ。次は原因を絞るため、V4.3までのFPS・snapshot processing時間と、V4.4のposition callback時間・frame gap・WebKit録画を比較する。

資料：Firebase公式 [Optimize Database Performance](https://firebase.google.com/docs/database/usage/optimize) / [RTDB Web](https://firebase.google.com/docs/database/web/read-and-write)；描画と予測の遅延のトレードオフは [Snapshot Interpolation](https://new.gafferongames.com/post/snapshot_interpolation/)。
