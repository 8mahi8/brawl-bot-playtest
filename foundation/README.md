# BRAWL — 共通ソースから生成する1vs1・2vs2 開発基盤 V1

更新: 2026-10-12

## 現在完成したもの

| 区分 | ファイル | 役割 |
| --- | --- | --- |
| 共通のキャラ性能と戦闘数値 | [共通仕様](../shared/brawl-core-contract.json) | HP/攻撃力/射程/移動速度/リロード、共通バランス数値、回復・ガス・ウルト・3連射の期待値を定義 |
| モードごとの設定 | [モード設定](../shared/brawl-build-modes.json) | 1vs1/2vs2のソーステンプレート、出力先、マップ固有エリア半径、旧APIのリロード単位、UI外観に使う色・ラベル |
| モード独自の処理 | [1vs1ソース](../src/modes/1v1.template.html) / [2vs2ソース](../src/modes/2v2.template.html) | 固有のカメラ、戦闘方式、モード/画面。旧試遊版のHTMLとは別に変更できる |
| 共通の実際の戦闘関数 | [combat-primitives](../shared/runtime/combat-primitives.inc.js) | 両HTMLに同じ `clamp`、タンク散弾の距離減衰、タンクジャンプ時間の計算を埋め込む |
| 共通の実際の索敵関数 | [stealth-visibility](../shared/runtime/stealth-visibility.inc.js) | 両HTMLに同じ `state/visible` を埋め込む。霧の描画は各モード専用 |
| ビルド | [build-brawl.cjs](../scripts/build-brawl.cjs) | 共有ソースと2つの開発用モードテンプレートを合成し、スタンドアロンHTMLを生成 |
| 生成した1vs1 | [1v1-foundation-v1.html](./1v1-foundation-v1.html) | 1vs1の従来操作とモード挙動を維持した新しいオフライン開発候補 |
| 生成した2vs2 | [2v2-foundation-v1.html](./2v2-foundation-v1.html) | 2vs2 R4.1の静かなUI、チームリンク、2vs2 KO/AREAを維持した新しいオフライン開発候補 |
| CI | [foundation-build.yml](../.github/workflows/foundation-build.yml) | 両ビルドの再現性、共有ソースの双方向伝播、実ゲーム回帰、PC/タッチ操作を自動検証 |

## ローカルでの作り方

Node.js 22 以上。実行はリポジトリのルートから。

```sh
node scripts/build-brawl.cjs --write
node scripts/build-brawl.cjs --check
node tests/foundation-build-smoke.cjs
node tests/foundation-2v2-gameplay.cjs
```

- `--write`: **新しい foundation 内の2つの生成HTMLだけ**を更新。旧試遊HTML、既存のFirebaseコード、Google Sitesは変更しない。
- `--check`: 現在の共通ファイル＋元ページからビルドした2ファイルと、GitHubにチェックインされている2ファイルが**バイト単位で一致すること**を確認。一方だけ再生成することを認めない。
- コア設定を変える場合は契約ファイルを変更してから両ビルドを生成し、CIを通す。生成HTMLを直接手でいじらない。
- 全バージョンは単一HTMLのまま動作し、外部JavaScriptの追加ダウンロードを必要としない。学校iPadやGoogle SitesのCSPに備えた方式。

## 何が自動で統一されるか

現在は、**キャラの基本値**（HP・移動速度・通常攻撃の基本ダメージ・射程・リロード）、コンバットコアに渡す**共通バランスパラメータ**、**同じタンクの減衰計算・ウルトジャンプ時間計算**、**霧の索敵ルール**が両モードの実際の出力に埋め込まれる。

テストでは共有ファイル中の移動速度やタンクの威力を変更したコピーを使い、両方の生成物が一緒に変わることを確認する。ブラウザテストでは1vs1のBOT開始・GAD消費、2vs2のBOT開始・GAD/ULT準備・HUD/ボタンの重なりを検査。

## 敢えて変更しない仕様

- 人数（1vs1/2vs2）、マップ（1000x600/1536x860）、カメラ、ガスの最大縮小範囲、2vs2のAREAモード、ルームnamespace/プロトコル。
- 1vs1の味方不在タンクと2vs2の味方リンクはそのまま。勝手にガジェット変更しない。
- 以前の1vs1/2vs2候補はリリース比較用に保存。どれが次の本番候補になるかもユーザー試遊で決める。

## まだ共通化していない部分（重要）

**戦闘エンジン全部や描画UIの一本化は未完了。** 現段階では旧試遊版から複製した独立した `src/modes/` テンプレート内の戦闘処理を使用し、変換対象の共通コードと数値だけを単一ソースにした。

既知の残差はタンクの散弾角、ガンナー連射中の発射座標、強化リロード、スナイパーの吹き飛ばし、1vs1のBOT行動、UI/カメラ、オンライン同期。これらを現状一致していると扱ってはいけない。

次に設計するときは、1vs1/2vs2の違いをモード層へ隔離し、実際の弾生成・射撃・ダメージ/リロード処理・GAD/ULTの共通部分を安全に取り出す。**先に比較テスト・既存動画やスクリーンショット・オンライン安全要件を準備してから**移行する。

## 品質上の制約

Chromium自動テストに合格しても、学校iPad Safariの実機、Google Sites、Firebase 4人同期、通信負荷、長時間対戦は未検証。BOT候補をオンライン版完成とは呼ばない。

[ユーザー提示前のUI品質基準](../BRAWL_UI_PRE_RELEASE_GATE.md)を引き続き遵守し、UIが邪魔な状態で試遊を渡さない。
