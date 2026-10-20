# BRAWL V4.5｜Firebase 2vs2の状態同期とHUDの仕事を分ける

**目的：学校iPad Safariで確認済みのFirebase接続方式を維持したまま、激しい戦闘での画面のカクつきと弾ラグの原因を測る。** Cloudflare方式は学校テストでHTTPS/WSS双方失敗し、移行は保留。

## 根拠：外部資料

- [Firebase公式 Optimize Database Performance](https://firebase.google.com/docs/database/usage/optimize)：まず転送量・読み取り/書き込み・購読頻度などを測定し、必要な経路のみを購読して処理する。むやみに接続先や通信方式を変更しない。
- [Firebase公式 Read and Write Data on the Web](https://firebase.google.com/docs/database/web/read-and-write)：親パスの `value` 購読は子孫の更新でも全値のSnapshotを返す。現在の `game` はダメージ・弾・HP・スコアなど同期上不可欠なため、部分購読への即時変更は避け、まずコールバック後の端末処理を軽量化する。
- [web.dev Rendering Performance](https://web.dev/articles/rendering-performance/)：ブラウザ画面の更新はメインスレッドのJavaScript、スタイル・レイアウト・ペイント等の時間配分に依存する。画面の変化と関係のないDOM計算をゲーム状態コールバックのたびに繰り返すのは避けたい。

## 実測で候補を棄却した：HUDのrAF集約（本番開発版には適用しない）

先行4人WebKit試験（ローカルFirebase、2026-10-20）は、HUD 1回の同期描画計算が平均 **約0.3ms**、27秒の`game`更新約295件に対し同一フレームへの集約は**各端末12〜15件**程度。待機が**最大192ms**に達するケースもあった。通信遅延を減らすわけでもなく、この規模の省CPUに対して画面表示が遅れるおそれがある。

よって、`friends-2v2-game-hud-v45.inc.js` は比較用の**opt-in実験コードとして保存するのみ**。ビルダーの `includeV45` は**デフォルトfalse**、公開版にも通常生成開発版にもHUD集約を入れない。`tests/friends-2v2-game-hud-v45.cjs` で特別に有効化した候補の安全性だけを検証。これは性能改善を採用したという意味ではない。

## V4.5で追加する正式な検証（通常・ドラフト2vs2の生成HTMLは従来仕様のまま）

- 4人でゲームに参加し、移動・射撃しながらローカルの`game`コールバック件数と処理時間、HUD更新件数、Canvasフレーム数を記録。通信は引き続きFirebase RTDB。
- 追加の比較では**同じ4クライアントが動く状態**で、10秒間は4クライアントともCanvas描画、続く11秒間は**他の3クライアントのCanvas描画のみ停止**してホストのフレーム間隔を観察し、最後に描画を元に戻す。全4人のFirebase購読/ゲーム計算/実際の入力・移動は継続する（これは**1台のブラウザ vs 4台のブラウザ比較ではない**）。切り替えはCIテスト内のHTMLだけ、通常生成ゲームコードには含まれない。
- 比較は同じ試合でも時間帯・弾数・CPU負荷が変化するので、因果関係を厳密に証明するものではない。**学校iPadの体感ラグを示す数字ではない**。

## ローカル専用評価

- 新規単体テスト `tests/friends-2v2-game-hud-v45.cjs`：不採用にした候補の安全性と通常の生成HTMLが無変更であることを検査。
- 4人WebKit+ローカルFirebase Emulatorの27秒移動・射撃テストで、`game`コールバック数と同期JS処理時間、HUD描画回数、画面フレーム落ちを匿名JSON記録。ホスト/ゲストの映像・静止画も記録。さらに前記の **CI専用4 Canvas対1 Canvas** 画面処理負荷の比較を行う。
- 実験候補をオンにした場合だけ `window.__brawlHudV45QA()` を公開する。正式な通常生成HTMLには入れない。いずれも room ID / player IDは記録しない。

## この結果ではまだ判断できないこと

- 4つのWebKitブラウザを1つのGitHub Actionsマシン上で動かした際の低FPSは、CIマシン全体のCPU共有・録画による影響と切り分けられていない。**学校iPadのFPSとして扱わない。**
- `gameSnapshotTotalMs` や `avgHudRenderMs` はブラウザの同期JavaScript処理時間であり、Firebaseパケットの送信時間・バイト数、iPadの物理的な画面表示の遅れを含まない。
- V4.5の差は端末ごとの「更新が1フレームに重なる頻度」で変わる。FPS改善・弾ラグ改善を**実測なしで断定しない**。
- 学校での最終判断は君が次のGoogle Sites公開候補を貼り、実機2vs2の操作感と診断結果を確認した段階で行う。

## 次の段階

今回の総合テストの結果を踏まえて、次に `game` 全体を購読し続けるか、一部を分離してよいかを判定する。Firebase経由の権威あるホスト処理は優先維持し、戦闘結果の整合性を壊す大改修はテストで比較してから行う。
