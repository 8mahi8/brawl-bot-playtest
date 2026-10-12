# BRAWL 共通開発基盤 V1.4

**実装済み:** 1vs1と2vs2のビルドで同じ数値・共通の実戦関数を使用し、GitHub Actionsで自動比較・回帰テストを実行できる。

**詳細な構成・ビルド手順・制約は [foundation/README.md](../foundation/README.md) を参照。**

## ソースの役割

- [brawl-core-contract.json](./brawl-core-contract.json) — キャラ性能・共通BALANCEの唯一の設定源。ここを編集すると両モードへ反映。
- [brawl-build-modes.json](./brawl-build-modes.json) — マップ固有の設定、キャラ表示名、1vs1の既存ウルト補足、入力テンプレート・生成先。
- [combat-primitives.inc.js](./runtime/combat-primitives.inc.js) — 両モードの減衰ダメージ・ジャンプ時間計算の**同じ実行コード**。
- [abilities.inc.js](./runtime/abilities.inc.js) — 両V8エンジンのガンナー/ボマー/スナイパーGADと全4キャラULTを統一。タンクGADはモード別。
- [match-state.inc.js](./runtime/match-state.inc.js) — 両V8ホストのHP・ウルト・KO/AREA決着、各モードでの自然回復数値を共有。
- [projectile-physics.inc.js](./runtime/projectile-physics.inc.js) — 1vs1の従来の弾と両V8ホストエンジンに同じ分割移動/衝突/距離減衰を適用。
- [combat-actions.inc.js](./runtime/combat-actions.inc.js) — 両V8エンジンの弾薬補充・射撃の弾生成を一つのコードで管理。
- [weapon-rules.inc.js](./runtime/weapon-rules.inc.js) — 散弾の広がり・3連射の間隔・強化リロード・弾速・スナイパーGAD距離を共通化。
- [stealth-visibility.inc.js](./runtime/stealth-visibility.inc.js) — 両モードの潜伏判定の**同じ実行コード**。
- [1vs1テンプレート](../src/modes/1v1.template.html) / [2vs2テンプレート](../src/modes/2v2.template.html) — モード固有の画面・戦闘・BOT処理。歴史的試遊ページを変更しないため、独立した開発ソースとしてコピー済み。
- [build-brawl.cjs](../scripts/build-brawl.cjs) — 共有ソースを2つのテンプレートに埋め込み、[1vs1](../foundation/1v1-foundation-v1.html) と [2vs2](../foundation/2v2-foundation-v1.html) のスタンドアロンHTMLを生成。
- [CI](../.github/workflows/foundation-build.yml) — `--check` で生成物の改変・未更新を検出し、共有設定の片側漏れ・両モードのゲーム・画面を検証。

## 変更するときのルール

1. 両方で同じ仕様なら**共通ファイルを一か所だけ直す**。
2. 人数・地形・勝利条件・モード独自のBOT/画面なら該当するモードテンプレートだけ直す。
3. `node scripts/build-brawl.cjs --write` で両方を再生成し、`--check` とテストを通す。
4. `foundation/*.html` は**生成物なので手編集禁止**。過去の試遊HTMLとオンライン版は上書きしない。
5. 通常のユーザー向け公開前に、[UI品質ゲート](../BRAWL_UI_PRE_RELEASE_GATE.md) の実画面チェックを通す。

## 未完了を明示

射撃の角度・発射タイミング・弾薬補充・命中・距離減衰に加え、両V8ホストのHPダメージ・勝敗/AREA判定と回復数値の計算も共有済み。両V8エンジンの技発動は基本的に共有済み。ただし**1vs1旧オンライン/単独BOT側の技管理、2vs2のタンク味方保護、試合の同期権限・BOT戦術・画面UI**はまだモード別に残る。共通化済みと誤認しない。今後の構造統合は、両モードの回帰検査を整えた上で段階的に行う。

学校iPad SafariやFirebase本番の4人同期は未確認。生成ページはオフラインBOT候補。
