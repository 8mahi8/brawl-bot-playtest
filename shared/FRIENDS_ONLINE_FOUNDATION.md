# BRAWL｜友達用オンライン4モード 開発基盤 V1

更新: 2026-10-19。以前のBOT専用 \`scripts/build-brawl.cjs\` とは別に、**実際に友達と遊ぶオンライン候補**を管理する。今回の実装はビルド・検証のみで公開版を差し替えない。

## 開発原則

- プレイヤー向けには通常／ドラフト × 1vs1／2vs2の4モード。Google Sitesへはそれぞれ **単一・自己完結HTML全文** を貼り付ける。GitHubのpushだけではGoogle Sitesは更新されない。
- **共通のバグ修正は一か所で直す**。1vs1と2vs2の通信・命中判定エンジンは違うため、性能上の理由なく無理に一本化しない。
- ルール／描画／UIと、人数・ドラフト専用機能の境界を明確にする。基本HP・武器・弾の挙動は4モード間で一致、GAD2などモード固有能力は例外。
- Firebase RTDBの本番設定・Rulesや現行Google Sites、固定された正式公開HTMLは **このビルドでは変更不可**。
- ローカルWebKit + Firebase Emulatorの合格は学校iPadの実機動作保証ではない。実機で検証した内容は別に記録する。

## 今回導入したもの

| 用途 | ファイル |
|---|---|
| 4モードのコード元／5桁ルームのルートと通信プロトコル | \`shared/friends-online-modes.json\` |
| 2vs2通常・ドラフト共通の「相手弾先行表示＋ボマーの飛行」の唯一の編集元 | \`shared/runtime/friends-2v2-early-shots.inc.js\` |
| 4つのGoogle Sites貼り付け用HTMLを安全に生成・整合性検証 | \`scripts/build-friends-online.cjs\` |
| 共通ソースを1つ変えると2vs2両方に伝播する保証／通常公開版の更新防止 | \`tests/friends-online-build.cjs\` |
| 戦闘バランス・共通描画パリティ | \`tests/friends-four-mode-readiness.cjs\` |
| 弾遅延とボマー飛行の予測・WebKit実戦再現 | \`tests/friends-2v2-latency-visual.cjs\`, \`tests/draft-friends-beta-webkit.cjs\`, \`tests/friends-2v2-normal-latency-webkit.cjs\` |

## 開発者が使うコマンド

\`\`\`sh
# ソースと既存の4つの候補HTMLの整合性を読むだけで検査
node scripts/build-friends-online.cjs --check
node tests/friends-online-build.cjs

# 新しい4モード単体HTMLを artifacts/friends-online/ のみに生成
node scripts/build-friends-online.cjs --emit

# 共通early-shotを修正した後、**2つの開発候補HTMLだけ**書き戻す
# 差分とWebKit/エミュレータテストを確認してPRにすること
node scripts/build-friends-online.cjs --sync
\`\`\`

\`--check\` は1つでも同期漏れがあれば失敗する。\`--emit\` はプレイヤー向けの新候補4本を一時成果物として生成するが、正式公開ファイルにもGitHub Pages/Google Sitesにも書き込まない。\`--sync\` は2vs2通常・ドラフトの \`*_LATENCY_CANDIDATE.html\` のみ更新可能。固定公開版、1vs1、別モードは対象外。

現時点の \`--emit\` は、既存の4つの候補をベースに2vs2の共通早期弾表示モジュールを注入する **安全な段階移行** である。4モードの全UI・戦闘エンジンが完全に一本化されたわけではない。開発原本の完全分離は次段階で行う。

## 2026-10-19 時点の参照HTML（自動検証対象）

- 通常1vs1: \`sites/BRAWL_FRIENDS_1vs1_QA_CANDIDATE.html\`
- 通常2vs2: \`sites/BRAWL_FRIENDS_2vs2_LATENCY_CANDIDATE.html\`
- ドラフト1vs1: \`sites/BRAWL_DRAFT_FRIENDS_BETA_1vs1.html\`
- ドラフト2vs2: \`sites/BRAWL_DRAFT_FRIENDS_BETA_2vs2_LATENCY_CANDIDATE.html\`

2vs2の全端末実戦で体感された「キャラは動くのに弾が遅い」は、少なくともホスト確定データ待ちの表示遅延によって説明できる。先行表示候補はこの待機をなくすための仮説改善で、実際の学校のWi-Fi／iPadでの改善値は未確認。

## 次段階の移行方針

1. **2vs2通信描画**: 全ユーザー向け共通早期弾表示を最初の本格共有モジュールとして運用し、意図せぬズレと先行表示バグを検出する。
2. **UIと入力**: ボタンの位置・サイズ・保存・画面サイズ対応の共通ライブラリ化。GAD2はドラフト2vs2のみ存在し、他モードに架空のボタンは追加しない。
3. **2vs2戦闘／ドラフト**: 通常のキャラ移動・弾・当たり判定とドラフト固有効果を分離。通常2vs2のネットコードをドラフトにコピーし続けない。
4. **1vs1戦闘／ドラフト**: 同様に1vs1内の共通ロジックを分離し、2vs2とは互換性をテストできた部分だけ共有する。
5. **公開手順**: 各HTMLをPRと自動テストで承認し、本人がGoogle Sitesへ貼り付けた後、実機での結果を記録。デプロイ自動化は本人の承認を得てから。

※ 古い \`draft/ARCHITECTURE.md\` と \`draft/variant-manifest.json\` はドラフト実装前の設計メモが残っている。運用中のオンライン候補のパス・ルートは **本書／\`shared/friends-online-modes.json\` を参照**すること。
