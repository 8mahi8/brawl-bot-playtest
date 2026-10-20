# BRAWL V4.7｜早期弾描画の重複探索を消す、実験限定の候補

学校で動作実績のあるFirebase RTDBは維持する。制作物は非公開の開発用コードとテストだけ。Google Sites、現在の公開用HTML、Firebase設定・Rules、Drive、ゲームバランスは変更しない。

## 調査

V4.6では、4人全員が移動射撃するローカルRTDB/WebKitの試験でACTION受信から弾のCanvas初描画指示までのp95は通常60〜82ms、ドラフト60〜93msだった。ただし同じCIマシンで4ブラウザを動かした数字で、学校の真の通信時間でも単一iPadのFPSでもない。描画フレームの待ち時間を「Firebaseが遅い」とは断定できない。

コードを確認すると `renderEarlyShots()` は毎フレーム実行され、早期弾ごとに毎回 `Object.keys(game.projectiles)` と `Object.values(game.scheduled)` を検索し、受理済み弾が確定描画へ移ったか確認する。多重同時発射の際は同じ一覧を何度も走査する。

## V4.7候補の変更点

`shared/runtime/friends-2v2-early-shots-v47.inc.js` は **opt-inの実験コード** であり、通常ビルダーのデフォルト出力には採用していない。

- 同時早期弾が4件以上の場面だけ、弾IDとボマーの予定弾を一度インデックス化し、同じフレームの重複一覧走査を減らす。
- 0〜3件は従来の処理のまま。通常時のインデックス生成負荷を避ける。
- FirebaseのイベントIDに使用できないコロンを含む特殊なIDは、既存の接頭一致をそのまま使う。
- 弾の位置、フレーム予測、効果、衝突、HP、Firebase購読、ネットワーク、ホスト確定には触れない。

## 検証

`node tests/friends-2v2-early-shot-index-v47.cjs` は、0/1/2/3/4/5/20/48件の早期弾と350個の関係ない確定弾、70件の予定弾を含む場面で、元の描画操作、残存弾、ボマー引き継ぎ・削除・描画回数の完全一致を確認する。通常/ドラフトの2vs2に実験モジュールを組み込んだ場合のJS構文も検査し、1vs1と既定4モードのHTMLに変化がないことも保証。

Node.jsの密集場面と少数場面でCPUマイクロベンチマークを実行する。ただしこれはSyntheticで実機FPS・通信ラグ改善の証拠ではない。テスト結果・安全性を確認し、効果が薄ければ本番開発版に入れない。外部方針：[Firebase公式性能最適化](https://firebase.google.com/docs/database/usage/optimize)、[web.dev Rendering Performance](https://web.dev/articles/rendering-performance/)。

今後は実際の4人WebKitで候補を有効にしたときの計測と映像レビューを行い、学校iPad向けの採用可否を判定する。
