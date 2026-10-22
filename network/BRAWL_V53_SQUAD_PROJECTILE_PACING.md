# BRAWL V5.3 — 2vs2の弾が止まる描画経路を限定的に検証（開発候補）

2026-10-23。対象は **生成されたステージング用通常/ドラフト2vs2のみ**。
既存 Google Sites 4ページ、本番 Firebase、Rules、固定 `sites/` 入力HTML、
通常/ドラフト1vs1、ホスト命中判定・HP・物理・戦闘順序には触らない。

## 問題の仮説

現行 `drawSmoothProjectiles()` は、最後の確定 `game.clock.wallAt` から
最大 **110ms** の位置補外しか行わない。`game` snapshot 到着間隔がこの
時間より伸びた場合、同じ生存弾の表示位置が次の確定更新まで止まり得る。
これは「弾が飛び飛びに見える」現象の**候補経路**であり、学校環境の根本原因を断定しない。

## 今回の変更

- `shared/runtime/friends-2v2-projectile-visual.inc.js` に
  `squadProjectileVisualAheadSeconds()` を追加し、staging の
  確定弾について **最大180ms** までの補外を試験する。
- `scripts/build-friends-online.cjs` は2vs2の `drawSmoothProjectiles()`
  にだけこの値を注入する。ピン留めした入力HTMLは一切書き換えず、
  `node scripts/build-friends-online.cjs --emit` の成果物だけが対象。
- 差分のうち増える表示位置は最大70ms×約660units/s = 約46.2units
  （典型例）。**これは見た目の差分で、ゲーム内物理位置とは一致しない**。

## 主な危険と採用条件

1. 更新が来ない間、弾が既に壁・プレイヤーに当たっている可能性がある。
   追加の最大70ms表示は、短い「見た目の通過・ゴースト」を起こす恐れがある。
2. 現状は時間補外を延長するのみで、壁・弾寿命・プレイヤー衝突を新たに
   予測したわけではない。**学校試遊候補にはまだしない**。
3. 既存の速い更新では通常の110ms以下の描画と一致することを、
   `tests/friends-2v2-projectile-pacing-v53.cjs` が元の通常/ドラフト
   HTMLと実際の生成 `drawSmoothProjectiles()` で比較する。
4. WebKit/ローカルFirebaseによる4人移動＋射撃と既存描画試験に合格後、
   実映像で「変な弾の貫通・発射直後のジャンプ」が無いことをレビューする。
   弾丸停止回数と見た目が改善するか数値で比較し、もし影響が小さい場合や
   ゴーストが増える場合は **不採用/差し戻し**。
5. **本番Google Sitesは絶対に自動更新しない。** GitHubのmain統合も
   この探索段階では保留。

## CI/テスト条件

`node tests/friends-2v2-projectile-pacing-v53.cjs`
は確定位置100 units・速度660 units/sで固定し、最後のスナップショットから
0/80/110/150/180/220msの描画コマンド位置を比較する。
この**決定的な再生**は学校Wi-Fi・Firebaseトランザクション待ち・
Safari実機FPS・実ディスプレイまでの表示遅延を測らない。

既存のGitHub Actionsでは通常/ドラフト2vs2とも4人のWebKitと
ローカル RTDB Emulatorによる射撃テストを走らせるが、
CIの4ブラウザを1台の共有マシンで動かす負荷は学校iPadと異なる。

参考: `network/BRAWL_V50_CANVAS_LOAD_STUDY.md`、
`network/BRAWL_V39_EXTERNAL_RESEARCH.md`。
