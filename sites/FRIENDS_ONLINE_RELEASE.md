# BRAWL｜友達オンライン対戦・安定公開版

**基準日：2026-10-18。** 今回をオンライン基盤の区切りとして固定し、以降の新キャラ・新要素は開発版／PRで実装します。

## 公開ファイル

| モード | GitHub上の公開用HTML | 扱い |
| --- | --- | --- |
| 1vs1 | [BRAWL_FRIENDS_1vs1.html](./BRAWL_FRIENDS_1vs1.html) | 既存の友達向け公開版をそのまま継続 |
| 2vs2 | [BRAWL_FRIENDS_2vs2.html](./BRAWL_FRIENDS_2vs2.html) | NEXT／開発版で4人対戦検証した2026-10-18時点の最新エンジン |

2vs2ではタッチ射撃・通信・HUD更新・静止時Canvasの最適化や低FPS時移動補正を取り込みました。ソースの唯一の違いは公開用タイトルです。BOT用オフラインHTML（`2vs2-ipad-bot-embed.html` など）は別製品で、オンライン対戦できません。

**公開版の固定:** `tests/sites-friends-release-freeze.cjs` が公開用2ファイルのGit blobを固定検証します。安定版コミットを指す退避ブランチは `stable/brawl-friends-2026-10-18`。追加機能の実装で公開HTMLを上書きしないこと。次の公開更新はユーザーの指示、実機確認とローカルFirebase E2Eを踏まえた別PRで行います。

## Google Sitesへの反映（手動）

GitHub PagesにHTMLがあることと、既存Google Sitesの埋め込みコードが更新されることは**別**です。GitHubの更新はGoogle Sitesを自動で編集しません。

1. Google Sitesで現在の1vs1・2vs2ページは残し、できればページを複製して退避してください。
2. GitHubで `sites/BRAWL_FRIENDS_2vs2.html` を開き、**Raw / 生データ**でHTML全文をコピーしてください（従来のURL埋め込みではなくHTMLコード埋め込み）。
3. Google Sitesの2vs2ページで「挿入 → 埋め込む → 埋め込みコード」を選び、古いHTMLを新しい全文へ差し替えます。画面からはみ出していないかプレビューで確認し、「公開」を押してください。
4. 1vs1は今回内容が変わらないので貼り直し不要です。オンライン接続設定には本人管理のFirebase Realtime Database URLと適切なRulesが必要です。
5. 学校iPad/スマホで、2vs2の4人入室・移動・射撃・HP・試合終了・再戦、KO/HOT ZONEを試してください。学校管理ブラウザや通信環境での快適さはCIだけでは保証できません。

## 開発ラインのルール

- 現在の公開用 `sites/BRAWL_FRIENDS_1vs1.html` と `sites/BRAWL_FRIENDS_2vs2.html` は次回の**明示的な公開承認まで固定**。
- `online/ipad-squad-v2-lab.html` と `sites/BRAWL_FRIENDS_2vs2_NEXT.html` は新要素の検証先。後者は前者とバイト単位で同期させる。
- 変更は別ブランチ → テスト → PR。オンライン実戦は本番Firebaseへ無断で書き込まず、ローカルエミュレーターで動作検証する。
- 安定版へ戻す必要があれば退避ブランチの公開用HTMLを利用する。勝手にFirebase Rulesを全公開しない。
