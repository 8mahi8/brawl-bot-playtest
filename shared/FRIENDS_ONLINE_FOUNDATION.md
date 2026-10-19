# BRAWL｜友達用オンライン4モード 開発基盤 V3

更新: 2026-10-19。以前のBOT専用 `scripts/build-brawl.cjs` とは別に、**実際に友達と遊ぶオンライン候補**を管理する。今回の実装はビルド・検証のみで公開版を差し替えない。

## 開発原則

- プレイヤー向けには通常／ドラフト × 1vs1／2vs2の4モード。Google Sitesへはそれぞれ **単一・自己完結HTML全文** を貼り付ける。GitHubのpushだけではGoogle Sitesは更新されない。
- **共通のバグ修正は一か所で直す**。1vs1と2vs2の通信・命中判定エンジンは違うため、性能上の理由なく無理に一本化しない。
- ルール／描画／UIと、人数・ドラフト専用機能の境界を明確にする。基本HP・武器・弾の挙動は4モード間で一致、GAD2などモード固有能力は例外。
- Firebase RTDBの本番設定・Rulesや現行Google Sites、固定された正式公開HTMLは **このビルドでは変更不可**。
- ローカルWebKit + Firebase Emulatorの合格は学校iPadの実機動作保証ではない。実機で検証した内容は別に記録する。

## 今回導入したもの

| 用途 | ファイル |
|---|---|
| 4モードのコード元／5桁ルームのルートと通信プロトコル | `shared/friends-online-modes.json` |
| **2vs2通常・ドラフト共通の受信・ホスト通信経路**：接続時のpresence登録・位置受信、発射イベントの処理、受領確認と再送制御、ホスト側の戦闘書込 | `shared/runtime/friends-2v2-presence-positions.inc.js`, `shared/runtime/friends-2v2-action-stream.inc.js`, `shared/runtime/friends-2v2-host-actions.inc.js` |
| 上記ネットワーク処理の互換テスト・両モードへの反映防止 | `tests/friends-2v2-network-foundation.cjs` |
| **V3.2 通常2vs2・ドラフト2vs2の共通戦闘/描画関数6件**：ホスト戦闘tick、位置書込、遠隔表示予測、HPプレビュー補正、自分の命中予測、戦闘FX再生 | `shared/runtime/friends-2v2-combat-presentation.inc.js`, `tests/friends-2v2-combat-presentation.cjs` |
| **V3.3 共通入力**：1vs1と2vs2のPC照準を別々に共通化。2vs2の入力遅延計測・壁衝突つき移動も共有 | `shared/runtime/friends-duel-pointer-aim.inc.js`, `shared/runtime/friends-squad-pointer-aim.inc.js`, `shared/runtime/friends-squad-input-timing.inc.js`, `shared/runtime/friends-squad-collision-movement.inc.js`, `tests/friends-input-controls-v33.cjs` |
| **通常2vs2／ドラフト2vs2共通の位置送信判定**：移動80ms・静止500msの既存周期を保持 | `shared/runtime/friends-2v2-position-publish.inc.js`, `tests/friends-2v2-position-cadence.cjs` |
| 全4モードに共通のGAD/ULT（ドラフト2vs2のみGAD2）ボタン座標・サイズ・保存データ読み取り | `shared/runtime/friends-control-layout.inc.js` |
| 2vs2通常・ドラフト共通の「相手弾先行表示＋ボマーの飛行」の唯一の編集元 | `shared/runtime/friends-2v2-early-shots.inc.js` |
| 4つのGoogle Sites貼り付け用HTMLを安全に生成・整合性検証 | `scripts/build-friends-online.cjs` |
| 共通ソースを1つ変えると2vs2両方に伝播する保証／通常公開版の更新防止 | `tests/friends-online-build.cjs` |
| ボタンの旧動作との計算／Safari風ブラウザ内ピクセル一致 | `tests/friends-control-layout.cjs`, `tests/friends-control-layout-webkit.cjs` |
| 戦闘バランス・共通描画パリティ | `tests/friends-four-mode-readiness.cjs` |
| 弾遅延とボマー飛行の予測・WebKit実戦再現 | `tests/friends-2v2-latency-visual.cjs`, `tests/draft-friends-beta-webkit.cjs`, `tests/friends-2v2-normal-latency-webkit.cjs` |

## 開発者が使うコマンド

```sh
# ソースと既存の4つの候補HTMLの整合性を読むだけで検査
node scripts/build-friends-online.cjs --check
node tests/friends-online-build.cjs
node tests/friends-control-layout.cjs
node tests/friends-2v2-network-foundation.cjs
node tests/friends-2v2-combat-presentation.cjs
node tests/friends-input-controls-v33.cjs
node tests/friends-2v2-position-cadence.cjs

# 新しい4モード単体HTMLを artifacts/friends-online/ のみに生成
node scripts/build-friends-online.cjs --emit

# 共通early-shotを修正した後、**2つの開発候補HTMLだけ**書き戻す
# 差分とWebKit/エミュレータテストを確認してPRにすること
node scripts/build-friends-online.cjs --sync
```

`--check` は入力候補のGit blob SHAも固定照合するため、元のHTMLが予期せず変わった場合は原因をレビューしてマニフェストのスナップショットを更新する。生成HTMLには新しい共通UIコードを埋め込むが、元のGoogle Sites用HTMLは書き換えない。

`--check` は1つでも同期漏れがあれば失敗する。`--emit` はプレイヤー向けの新候補4本を一時成果物として生成するが、正式公開ファイルにもGitHub Pages/Google Sitesにも書き込まない。`--sync` は2vs2通常・ドラフトの `*_LATENCY_CANDIDATE.html` のみ更新可能。固定公開版、1vs1、別モードは対象外。

現時点の `--emit` は、既存の4候補を元に早期弾表示＋4モードの共通ボタン配置計算を差し込む **安全な段階移行** である。1vs1と2vs2で異なる画面の大きさ・保存キーはそのまま使う。1vs1は `brawl_v28_buttons`、2vs2は `brawl-v3-2v2-r4-layout`、ドラフト2vs2のGAD2は別キー `brawl-draft-2v2-gad2-layout-v1` のまま維持する。`--sync` では早期弾の2vs2候補だけ同期し、共通ボタンUIはステージング専用。4モードの全UI・戦闘エンジンが完全に一本化されたわけではない。開発原本の完全分離は次段階で行う。

## 2026-10-19 時点の参照HTML（自動検証対象）

- 通常1vs1: `sites/BRAWL_FRIENDS_1vs1_QA_CANDIDATE.html`
- 通常2vs2: `sites/BRAWL_FRIENDS_2vs2_LATENCY_CANDIDATE.html`
- ドラフト1vs1: `sites/BRAWL_DRAFT_FRIENDS_BETA_1vs1.html`
- ドラフト2vs2: `sites/BRAWL_DRAFT_FRIENDS_BETA_2vs2_LATENCY_CANDIDATE.html`

2vs2の全端末実戦で体感された「キャラは動くのに弾が遅い」は、少なくともホスト確定データ待ちの表示遅延によって説明できる。先行表示候補はこの待機をなくすための仮説改善で、実際の学校のWi-Fi／iPadでの改善値は未確認。

## V3: 2vs2通信パイプラインの移行境界

- 初回抽出時に既存の2vs2通常・ドラフトHTMLと共通モジュールがバイト単位で一致することを確認した。元のHTMLは固定SHAで保護し、以降の修正は **共通モジュール1か所だけ**変更してステージング版へ自動注入する（元のHTMLを追って手修正する必要なし）。実装済みの4モード源HTMLとGoogle Sitesは差し替えない。
- `registerPresence` / `validPosition` / `ingestPositions`: 接続世代、移動シーケンス番号とステート同期を維持する。
- `acceptAction` から `submitAction`: 一時的なクライアント予測、受理済みイベントの照合、クラウド発射確定とリトライ判断。ドラフト固有の `validActionRequest` は共通化しない（ドラフトのみ `gadget2` を許可）。
- `processHostQueue`: 同時発射を最大6アクション単位で処理するホスト側Firebaseトランザクション。カードやモード固有ルールは引き続き既存の `engine(g)` に保持する。
- 生成済み4モードを自動テストし、2vs2 **通常・ドラフトの生成版を4人のWebKit端末＋ローカルFirebaseエミュレーターで実際に試合進行させる**。古い候補版でも同じテストを実行する。
- 共通化の目的は安全性・保守性。**実測ラグが軽減したと主張しない**。学校環境の再試験で確認する。
- 次の移行候補: 各キャラの通常攻撃・壁当たり判定・戦闘状態更新（モード固有のカード処理とは分離）。先に一致性と遅延計測を確認し、段階的に進める。

## 次段階の移行方針

1. **2vs2通信描画**: 全ユーザー向け共通早期弾表示を最初の本格共有モジュールとして運用し、意図せぬズレと先行表示バグを検出する。
2. **UIと入力**: 位置・サイズ・保存の共通計算は V2 で完了。残る画面要素の共通化とタッチ操作の状態管理、UIテストを順次進める。GAD2はドラフト2vs2のみ存在する。
3. **2vs2戦闘／ドラフト**: 位置同期・アクション送信・ホスト書込はV3で共通化。次に同じと証明できる通常の弾・ダメージの計算を抽出し、ドラフト固有効果は分離したままにする。
4. **1vs1戦闘／ドラフト**: 同様に1vs1内の共通ロジックを分離し、2vs2とは互換性をテストできた部分だけ共有する。
5. **公開手順**: 各HTMLをPRと自動テストで承認し、本人がGoogle Sitesへ貼り付けた後、実機での結果を記録。デプロイ自動化は本人の承認を得てから。

※ 古い `draft/ARCHITECTURE.md` と `draft/variant-manifest.json` はドラフト実装前の設計メモが残っている。運用中のオンライン候補のパス・ルートは **本書／`shared/friends-online-modes.json` を参照**すること。

## V3.2: 共通戦闘/描画関数の安全な段階抽出（2026-10-20）

旧PR #94の競合と抽出テスト失敗を避け、**すでに統合済みのV3通信処理を再抽出しない**。元の通常/ドラフト2vs2候補HTMLから文字列完全一致が証明できた6関数のみを共通ソースとして使う。元HTML・本番Firebase・現在のGoogle Sitesは一切変更せず、共通ソースを`--emit`の開発用HTMLへ組み込む。自動テストは関数重複の排除、4モード間の分離、両2vs2への伝播、旧入力HTMLの固定検査、ローカルFirebase＋WebKitでの実対戦を確認する。

**共通化は保守性の改善であり、学校iPadの通信遅延が軽減したことの証拠ではない。** 実機測定が終わるまで、新ビルドのGoogle Sites公開は本人が明示的に決める。

## V3.3: 既存の入力最適化を保った共通ソース（2026-10-20）

通常／ドラフトの両1vs1で完全一致したPCポインタ照準処理3関数を duelPointerAim、通常／ドラフトの両2vs2で完全一致したPCポインタ照準処理3関数を squadPointerAim として、**通信・表示仕様を混ぜずに別モジュール化**する。さらに2vs2専用のイベントキュー遅延計測と、壁貫通を防ぐ移動サブステップも、既存コードと完全一致したブロックのみ共通ソース化。

4モードのステージングHTML生成時、従来と**まったく同じ関数位置**でソースを入れ替える。古いHTML／Google Sites／本番Firebaseは変更しない。テストではソースの一致、1vs1と2vs2の分離、通常とドラフトへの単一編集伝播、PC照準・移動・入力タイムスタンプの各種境界値を確認する。既存の画面タッチハンドラや攻撃通信方式の全面再設計は行わない。

この変更は保守性の改善であり、学校での2vs2弾ラグを実測で改善したと主張しない。

## V3.4：タッチ操作と攻撃入力の共通化（2026-10-20）

通常/ドラフト1vs1で既に同一だった pointerDown/pointerMove/pointerUp とULT・アクションボタンのタッチ/クリック抑止を二つの別モジュールとして共有する。通常/ドラフト2vs2は Canvas pointerdown/move/up/cancel/lostpointercapture、敵選択と shootAngle/bulletSpecs、touch発射からCanvas描画提出までの計測を三つの別モジュールにする。元HTMLで**完全一致した文字列だけ**採用。GAD2や特別ルールには触れない。

共通ブロックは既存関数/イベント登録と同じ位置で差し替えるため、今の出荷候補の初期ビルドはコードとして no-op の設計。2vs2射撃は submitAction 経由でホストによるHP/KOの確定を維持。既存の1vs1と2vs2の通信方式も統合しない。

テスト：前段V3.3の4モード不変チェック＋5モジュールのソース一致・二重登録防止・モード隔離、タッチ開始/移動/解除/キャンセル、射撃アクション、first-paint時間、WebKit 4人対戦（Firebaseローカルエミュレータ）を回帰させる。**Google Sites、本番Firebaseと公開HTMLは変更しない。** 本変更は保守基盤の改善で、学校iPadの実測ラグ低減を証明するものではない。

Node実行：`node tests/friends-touch-combat-v34.cjs`。開発用HTML：`node scripts/build-friends-online.cjs --emit`（stagingのみ）。

## V3.5：2vs2 弾ラグの切り分け用・ローカル診断（2026-10-20）

既存の早期弾描画とホスト描画へのhandoff、Firebase listener callback数、フレーム落ち・Canvas描画時間、タッチイベント処理時間を区別する**任意起動・ローカル専用**の計測APIを、通常/ドラフト2vs2の生成済みstaging HTMLに挿入する。元HTML・Google Sites・本番Firebase・通信ルールは変えない。1vs1には挿入しない。

WebKit開発用コンソールで、対戦が `playing` に入ったら `window.__brawlLatencyV35QA.start(250)`、観測後に `window.__brawlLatencyV35QA.stop()` または `window.__brawlLatencyV35QA.report()` を呼ぶ。これらはJSON互換の集計値を返す。`reset()`で記録を消せる。100～1000msの計測間隔だけ許可し、最大480測定点をメモリに保持。デフォルトではintervalなし、Firebaseにも外部にも一切送信しない。マッチ/ラウンドが切り替わったら記録を自動クリアし、ルームID・ユーザーIDなどはレポートしない。

比較項目：`projectile.receivedActionCount`, `previewDrawOperations`, `hostVisualHandoffCount`、`traffic.gameSnapshotsPerSecond`, `positionCallbacksPerSecond`、`presentation.framesPerSecond`, `frameGapOver100msPercent`, `averageCanvasDrawMs`, `averageNonDrawWorkMs`、`input.latestHandlerToCanvasSubmissionMs`。

**重要**：callback頻度はping/往復時間ではない。`previewDrawOperations`は弾ごとの件数ではなく描画の反復回数。Canvas送信までの時間は液晶表示までの時間ではない。sessionMaxは計測窓だけでなくセッション全体の最大値。実機iPadの遅延改善を示す測定値が揃うまでは「直った」と判断しない。

自動回帰：`node tests/friends-2v2-latency-probe-v35.cjs`、4人WebKit＋Firebase **ローカル**エミュレータ上の通常/ドラフト生成版で実弾を観測。学校へ貼る公開HTMLの変更は本人承認の別工程。

## V3.6：弾ラグ検証基盤の最終ゲート（2026-10-20）

- `tests/friends-2v2-lag-stress-v36.cjs` は0〜160msの合成受信遅延、ジッター、16.67〜50msの描画間隔を固定seedでシミュレーションし、p50/p95/maxを比較する。**実際の通信品質やiPad実測とは異なる**。
- `tests/friends-2v2-lag-delivery-webkit-v36.cjs` は**Firebaseローカルエミュレータ + WebKit 4人対戦**で、生成済み2vs2（通常版）の *ACTION callback の実行のみ*、指定した2端末に180ms/350msのテスト遅延を加える。これはネットワークパケットへの遅延注入ではなく、受信イベント処理の遅延を模したもの。第三者への通信、本番Firebase操作、既存HTMLの変更はない。
- ACTIONの遅延下でも、ホストによる射撃のacceptとHP確定、表示イベントの到着、WebKitの例外ゼロを確認する。遅延で既にホストスナップショットが進んだ時は、先行描画がスキップされる場合があるため、*視覚的即応が保証された*とは報告しない。
- CI は `artifacts/qa/v36-synthetic-scenarios.json` と `artifacts/qa/v36-four-peer-delivery-lag.json` を生成して `brawl-v36-lag-stress-results` の7日間限定artifactとして保存する。個人情報・ルームID・プレイヤーIDは含まない。
- 基盤開発はいったんここで一区切り。学校での弾ラグが再現した場合は、個別に原因を特定して既存moduleを直す。診断UIの追加や公開版の変更は不要／未承認のため行わない。
