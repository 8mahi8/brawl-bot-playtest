# BRAWL Phase Mist ステルス試験版

状態: **IMPLEMENTED AS ISOLATED PLAYTEST — NOT PROMOTED TO STABLE**

- 1vs1: [1v1-stealth-test.html](./1v1-stealth-test.html)
- 2vs2: [2v2-stealth-test.html](./2v2-stealth-test.html)
- 試遊ページ: [playtest.html](./playtest.html)
- 見比べる旧版: [1v1-smooth-test.html](./1v1-smooth-test.html) / [2v2-smooth-test.html](./2v2-smooth-test.html)

## 実装内容

- 隠密エリアを草ではなく **Phase Mist**（青緑の低彩度・霧状の波ライン）として表現。縁は **Silent Veil** 型の読みやすい1.8pxの境界線。
- 1vs1/2vs2とも床を低コントラストのライン床、障害物を簡潔なスレート系の壁に統一。
- 共通ロジック `BrawlStealthV1` をそれぞれのHTMLに同一コードで埋め込み（配信時に別JSの外部ロード不要）：
  - `state({viewer,target,concealed,revealedUntil,now})` — visible / hidden / detected / revealed
  - `visible(args)` — 自動照準と敵判定
  - `drawFields(ctx,zones,t)` — フィールド描画
  - `indicator(ctx,position,state)` — 潜伏/露出・発見距離表示
- 130ワールド単位以内なら隠れていても「発見中」。攻撃と被弾は共に1500ms露出。遠くにいればその後再潜伏。
- 自キャラは潜伏中のみalpha=0.45。ヘルスバーなどの情報UIは不透明のまま。自分の発見半径を破線で表示。
- 1vs1は手動プレイ、オートエイム、BOT索敵が共通視認判定を使用。2vs2もプレイヤーの照準補助・HUD・BOT索敵を共通視認判定へ統一。
- キャラ性能と従来のKO/HZマップ座標は変更していない。2vs2 KOの広域3ルートマップは **別ステップ** に分離。PCマウスの「押して照準→離して撃つ」はこの版にはまだ含まれない。

## チェック済み（コードとロジック）

- 両ファイルのJS構文。
- CSP接続禁止とバランス数値の維持、スムーズ弾描画コードの維持。
- 隠密ロジック9ケース（130の境界、露出、自動照準、再潜伏、共通モジュール一致、Canvas描画呼出し）。
- 2vs2 BOTの隠密ターゲット非選択／露出後の認識／130以内接近時の認識。

## 未確認／実機確認したいこと

- PCの複数BOT戦・iPad Safariでの描画FPS・フォントや破線リングの視認性。
- 2vs2全キャラとKO/HZを通した長時間ストレス試験。
- Steam等のネイティブゲーム実装ではなく、GitHub Pagesの**オフラインBOT専用ページ**。
- 観測者ごとに真の情報秘匿が必要なオンライン対戦には、このUI上の隠密だけでは不足するため別途サーバー設計が必要。

2026-10-12
