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
