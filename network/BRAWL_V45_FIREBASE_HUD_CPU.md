# BRAWL V4.5｜Firebase 2vs2の状態同期とHUDの仕事を分ける

**目的：学校iPad Safariで確認済みのFirebase接続方式を維持したまま、激しい戦闘での画面のカクつきと弾ラグの原因を測る。** Cloudflare方式は学校テストでHTTPS/WSS双方失敗し、移行は保留。

## 根拠：外部資料

- [Firebase公式 Optimize Database Performance](https://firebase.google.com/docs/database/usage/optimize)：まず転送量・読み取り/書き込み・購読頻度などを測定し、必要な経路のみを購読して処理する。むやみに接続先や通信方式を変更しない。
- [Firebase公式 Read and Write Data on the Web](https://firebase.google.com/docs/database/web/read-and-write)：親パスの `value` 購読は子孫の更新でも全値のSnapshotを返す。現在の `game` はダメージ・弾・HP・スコアなど同期上不可欠なため、部分購読への即時変更は避け、まずコールバック後の端末処理を軽量化する。
- [web.dev Rendering Performance](https://web.dev/articles/rendering-performance/)：ブラウザ画面の更新はメインスレッドのJavaScript、スタイル・レイアウト・ペイント等の時間配分に依存する。画面の変化と関係のないDOM計算をゲーム状態コールバックのたびに繰り返すのは避けたい。

## V4.5変更（生成する開発用normal/draft 2vs2のみ）

- `shared/runtime/friends-2v2-game-hud-v45.inc.js` を追加。通常の戦闘中に複数の `game` 通知が1フレームに重なった場合、**HP/ULT/弾数などのHUD計算を次の描画フレームにまとめる**。画面上の数字は常に**最新の状態**から描画する（古いスナップショットの値を後から表示しない）。
- ラウンド切替、勝敗決定、停止/非表示タブ、初回ゲーム入場のHUDは**即時処理**のまま。
- 250ms間隔の周期HUD更新も維持。フレームが遅れて先に周期更新が完了した場合は、キュー済みの重複処理をキャンセル。
- **Firebaseの購読先・書込み、射撃ACTION、ホストの当たり判定、HPの正式確定、弾の視覚補正、BOT、ゲームルールは一切変更しない。** V4.4の位置情報差分リスナーも引き続き動作する。
- 1vs1、既存の固定 `sites/` HTMLと公開Google Sitesは不変。Google Driveへの保存もしない。

## ローカル専用評価

- 新規単体テスト `tests/friends-2v2-game-hud-v45.cjs`：複数通知が1回のHUD計算になるか、試合切替・ブラウザ非表示・部屋切替・周期HUD更新が即時で安全か。
- 4人WebKit+ローカルFirebase Emulatorの27秒移動・射撃テストで、`game`コールバック数と同期JS処理時間、HUD描画回数、画面フレーム落ちを匿名JSON記録。ホスト/ゲストの映像・静止画も記録。
- 読み取り可能な `window.__brawlHudV45QA()` は **ローカルのみ**、受理率や実際のネットワークpingではなくHUD計算の回数と時間だけを返す。room ID / player IDは返さない。

## この結果ではまだ判断できないこと

- 4つのWebKitブラウザを1つのGitHub Actionsマシン上で動かした際の低FPSは、CIマシン全体のCPU共有・録画による影響と切り分けられていない。**学校iPadのFPSとして扱わない。**
- `gameSnapshotTotalMs` や `avgHudRenderMs` はブラウザの同期JavaScript処理時間であり、Firebaseパケットの送信時間・バイト数、iPadの物理的な画面表示の遅れを含まない。
- V4.5の差は端末ごとの「更新が1フレームに重なる頻度」で変わる。FPS改善・弾ラグ改善を**実測なしで断定しない**。
- 学校での最終判断は君が次のGoogle Sites公開候補を貼り、実機2vs2の操作感と診断結果を確認した段階で行う。

## 次の段階

今回の総合テストの結果を踏まえて、次に `game` 全体を購読し続けるか、一部を分離してよいかを判定する。Firebase経由の権威あるホスト処理は優先維持し、戦闘結果の整合性を壊す大改修はテストで比較してから行う。
