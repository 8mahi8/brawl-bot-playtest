# BRAWL V5.0｜4画面→1画面→4画面の描画負荷切り分け

Google Sites・学校iPadの実測ではなく、GitHub Actions上のWebKit/ローカルFirebase RTDBでの**同じホスト画面の比較**をする研究。公開版・本番Firebase設定/Rules・Google Driveは変更しない。

## 既知の事実

V4.9の通常/ドラフト2vs2の27秒4人同時射撃テストでは、ACTION受信後の次rAFまでのp95が約49〜74ms、最初のrAFから可視弾の描画命令までのp95は約4〜13ms。ただし後者は描画に成功した弾だけで集計され、両者のp95は直接加減算できない。4 WebKitコンテキストは同じCIホストを共有し、このFPS/待ちは単一の学校iPadのFPSを示さない。

V4.5の既存Canvas隔離テストでは、同じホストで4画面のCanvas描画を1画面に減らすとFPSが大きく変わることが示されている。しかし、その時点ではV4.9のACTION→rAF待ちの比較はなかった。

## 計測すること

環境変数 BRAWL_STAGE_2V2=1 BRAWL_V45_ISOLATE_CANVAS=1 BRAWL_V46_BASELINE_ACTIONS=1 BRAWL_V49_RENDER_PHASES=1 BRAWL_V50_CANVAS_CPU_SPLIT=1 で既存の自動操縦4人WebKit試験を通常・ドラフトそれぞれ実行する。

- フェーズA｜4 Canvas（約10秒）：4人全員のCanvasを通常描画。
- フェーズB｜1 Canvas（約11秒）：3人のゲストのCanvas描画だけを無効化。4人ともFirebase ACTION受信、移動、射撃、ホストの決定、UI処理は続ける。
- フェーズC｜4 Canvas復帰（約6秒）：ゲストのCanvasを再開して結果の戻りを確認。

同じホストのV4.9 ShotFrame計測を各フェーズで区切り、遠隔ACTION件数、ACTION受信→最初のrAF p50/p95、最初のrAF→弾描画命令p95、実際に描画を確認できた件数、待機中の描画スキップ数を保存。V4.5のフレームFPS、100ms超のギャップ数、ゲームスナップショットCPUも同じ期間で比較。合計ACTION件数は従来V3.9のホスト数と一致させる。

## 重要な制約

4 WebKitページとFirebaseエミュレータを1台のCI仮想マシン上で動かしたまま、Canvasを描く端末役だけを変える。フェーズは時間順なので、端末役の数とトラフィック傾向は同じでも、CIのCPU状況やキャラクター位置は完全には一致しない。これは単一ブラウザ vs 4ブラウザの厳密な比較ではなく、4人の通信を保ったままのCanvas負荷比較である。学校のiPadのネットワーク/画面表示やFirebase実サーバーの遅延は測れない。

試験以外のコード・リポジトリの既存本番HTMLは不変。テスト専用スイッチは通常ビルドに含めず、ユーザーの操作画面に新しいボタンも出さない。

## 判定

フェーズBでフレーム待ちだけが小さくなり、4 Canvas復帰で増えるなら、CIの共有Canvas/CPU負荷の影響と整合する。通信や当たり判定を変える証拠とは見なさない。差が不明確なら修正はしない。実機の答えが必要なら、次回Google Sitesの埋め込み条件やiPadの実測に進む。

参考：[MDN requestAnimationFrame](https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame)、[Firebase Optimize Database Performance](https://firebase.google.com/docs/database/usage/optimize)。
