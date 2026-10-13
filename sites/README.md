# BRAWL — 学校iPad用・Google SitesのHTML直接埋め込み

Google Sitesへの貼り付けはユーザー本人がPCから行います。ここに置くのは **GitHub PagesのURLを読み込まない、完全なHTML全文** です。

| モード | PCから開くファイル | 内容 |
| --- | --- | --- |
| 1vs1 | [1vs1-ipad-bot-embed.html](./1vs1-ipad-bot-embed.html) | 共通戦闘基盤と1vs1 BOTの改良版 |
| 2vs2 | [2vs2-ipad-bot-embed.html](./2vs2-ipad-bot-embed.html) | 学校iPad/Safari向けUIと2vs2 BOT練習版 |

## PCでの手順

1. 各ファイルをGitHub上で開き、**Raw（生データ）** を選ぶ。Raw表示をPCで全選択してコピーするか、Download raw fileでHTMLとしてダウンロードする。
2. Google Sites編集画面で「1vs1」と「2vs2」のページを**別々**に開く。
3. 右側の「挿入」→「埋め込む」→**「埋め込みコード」** に、対応するHTML全文を貼る。**URLタブは使わない。**
4. ゲーム領域をできるだけ広くし、実際に「プレビュー」または公開画面でBOT対戦を試す。編集画面でボタンの押下判定を評価しない。
5. 学校iPadのSafariでサイトのページを開き、画面表示、BOT開始、左ドラッグ移動・右側タップ射撃・2本指操作、GAD/ULT、画面回転を確認。
6. ページ切り替えはGoogle Sitesの標準メニューで。ゲームHTML内の「他モードへ」リンクは削除してある。
7. 以前のオンライン版・安定版のページはバックアップとして残す。新規ページで確認してから切り替える。

## 注意

- **この2ファイルはオフラインBOT練習専用でオンライン対戦はできない。** 本番Firebaseに触れないようCSPでネットワーク接続を禁止している。GitHub PagesへのHTTP取得も不要。
- GitHubの開発元やオンライン試作は別管理。BOT版の変更を公開する場合は、この `sites/` のHTMLも作り直し、`node tests/sites-embed-regression.cjs` で差分・ブラウザ試遊を検査する。
- **Google SitesへのHTML貼付けは手動反映**。GitHubだけ更新しても埋め込みHTMLは自動では更新されない。
- Google Sitesのiframe制約と学校管理Safariの動作は、最終的に実機で確認する。学校のフィルタリング・利用規則も尊重する。
- オンラインの開発候補は別ブランチの [Draft PR #8](https://github.com/8mahi8/brawl-bot-playtest/pull/8)。模擬接続まで確認できたが、実Firebase認証・権限制御・多人数通信は未確認で**公開用の完成品ではない**。
