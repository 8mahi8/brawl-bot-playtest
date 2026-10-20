# BRAWL｜学校iPad Cloudflare接続確認（ゲーム本体と独立）

**状態：ソースコード・自動テストのみ。Cloudflareには未デプロイ。学校での接続は未検証。** 2026-10-21。

この検証は「Cloudflare WorkerのHTTPS/WSSが、学校iPadのGoogle Sitesに埋めたページから使えるか」を確かめる第一段階。**通常/ドラフトBRAWL本体、Firebase DB、Google Sites公開中ページ、Driveは一切変更しない。**

## 使うファイル

- `worker.mjs`：Cloudflare Workerの受信側。 GET /health → JSON、 GET /ws → WebSocket Upgrade → ping/pong返信。部屋・対戦・認証・個人情報・データ保存なし。Worker単体のため、Durable Objectsや有料ゲームサーバーはまだ不要。
- `GoogleSites_Embed_Code.txt`：そのままGoogle Sitesの**「埋め込む」→「埋め込みコード」**に全文を貼るHTMLソース。ゲームのページには貼らず、**別のテスト用ページ**に貼る。
- `tests/cloudflare-school-probe.cjs`：Cloudflareへ通信せず、Workerとページの通信・失敗表示を自動テスト。

## 一度だけ必要なCloudflare側の操作

Cloudflareのアカウントで [Workers & Pages](https://dash.cloudflare.com/) → Workerの作成 → `Edit code`（編集画面の表示名は変わる可能性あり）。最初のサンプルコードを `worker.mjs` の中身に置き換え、`Deploy` する。**まだBRAWL対戦の移行ではない。**

デプロイ後にCloudflareが表示するHTTPS Worker URL（例の形式：`https://<worker>.<account>.workers.dev`）を取得する。**このURLはユーザーの実際のデプロイ結果でなければ使えない。**  URLから `/health` をブラウザで開き、`{"probe":"brawl-cf-connect","version":1,"status":"ok"}` が返るか確認する。これはHTTPS疎通だけでWebSocket動作は未確認。

Cloudflare公式ドキュメント：
- https://developers.cloudflare.com/workers/get-started/dashboard/
- https://developers.cloudflare.com/workers/runtime-apis/websockets/
- https://developers.cloudflare.com/workers/configuration/routing/workers-dev/

## Google Sites（ユーザーが貼り付ける）

1. 既存BRAWLゲームページとは別に一時的なテストページを用意。
2. `GoogleSites_Embed_Code.txt` の**中身全体**を「埋め込む」→「埋め込みコード」へ貼り付ける。ファイルのリンクを埋める方式ではない。
3. 別ページとして公開するときは公開範囲に注意。Worker URLは配布可能なURLだが、第三者からも接続され得る。Workerは1コネクション12メッセージまでなど制限あり。公開が終わったら一時ページは削除してもよい。
4. ページ内のWorker URL入力欄にCloudflareで実際に公開されたHTTPS URLを入力し、「接続テスト開始」を押す。
5. まず家庭/個人回線から**Safari直開きとGoogle Sites内**を比較。その次に、学校で許可されている範囲で学校iPadから同じGoogle Sitesテストページで確認。

## 結果の読み方

| 結果 | 判断 |
| --- | --- |
| HTTPS成功、WebSocketも成功、5/5応答 | Cloudflareへの基本通信は使える可能性が高い。ゲームへの採用は次段階の実装・高負荷比較が必要。 |
| HTTPS成功、WebSocket失敗 | HTTPSは到達するが、WebSocket Upgrade、埋め込みポリシー、ネットワーク、Worker実装など要切り分け。**学校がブロックしたと断定できない。** |
| HTTPSも失敗 | URL/Workerの公開状態、ネットワーク、CORS/iframe制約の切り分けが必要。 |
| Safari直開きは成功、Google Sites内は失敗 | Google Sites内のiframe制約やブラウザのセキュリティ設定の可能性が上がる。 |
| 家では成功、学校で失敗 | 学校の接続設定・ネットワークポリシーとの差が疑われる。無理に制限を迂回しない。 |

ページのRTTは`performance.now()`で同一端末で測った5回のping/pong往復時間。**FirebaseのRTTやBRAWLの弾ラグの改善値ではない**。通信が通るだけでは4人対戦に必要な継続接続・転送負荷・同期性能は確認できていない。

## セキュリティ・コスト

- WorkerはHTTPS / WebSocketしか受け付けず、pingと短いnonce/連番しか反射しない。ブラウザから認証情報・ユーザー名・ルーム番号は送信しない。
- `/health`はGoogle Sitesから呼べるよう`Access-Control-Allow-Origin: *`。WebSocketはCORS方式とは異なる。
- Cloudflare Workerは公衆に開いたエンドポイントであり、外部からのアクセス自体を技術的に禁止はしていない。Worker利用量をCloudflareダッシュボードで監視し、不要なら停止/削除すること。
- 有料サービスの契約や有料プランの変更はこの検証では不要。無料枠にも利用量の制限がある。
- 学校でサイト/通信が禁止されている場合はその規則を尊重。フィルタリング回避の試みはしない。

## 受け入れ判定

A. WorkerとHTMLの無害なリクエストをオフラインのテストで検証。

B. Worker URLが実際に配布されるまでは「デプロイ済み」と言わない。

C. 学校iPadのGoogle Sitesページから5/5応答が得られたとき初めて「学校から基本的なWSSエコー通信が可能」と言える。ゲームサーバーとして使えるかの判定はその後。

D. Firebase現行対戦を壊さないまま、次にDurable Objects等を用いた2端末/4端末メッセージ中継プロトタイプと負荷比較へ進む。
