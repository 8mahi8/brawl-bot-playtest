# BRAWL Tactical Draft ONLINE 1vs1 — local emulator preview V0.1
更新：2026-10-18

この段階は**学校公開版ではありません**。Google Sitesに貼り付ける正式版HTMLは作成せず、通常1vs1・2vs2にも変更なし。BOTドラフトは従来のオフライン試作として別ファイルに保持します。

## 新しい開発用HTML
- `online/draft-duel-online-lab.html`
- `draft/duel-online-prototype.inc.js`

既存のオンライン1vs1戦闘エンジンを基に、ドラフト独立ルート `roomsDraft1v1` とプロトコル `1031` を採用しています。3勝先取、初回カード無し、勝者先攻の指名、2人共通4枚、取得済みカードの指名不可、各自3枚蓄積と明示交換、試合終了でリセットを実装。先行のBOT試作と同じ最初の8枚（機動・装填・防御・追撃）の戦闘フックをオンライン側でも暫定接続しています。ボマー爆弾やDOT・ガジェットへの補正は未実装で、キャラ固有の既存性能を維持します。

## 安全境界
- **localhost/127.0.0.1 以外からFirebaseへ接続できません**。GitHub PagesやGoogle Sitesではオンライン機能が開始できない検証版です。
- 開発HTMLのFirebase接続は `db.useEmulator('127.0.0.1',9000)` に固定。本番DB URLは入力・保存・送信しません。
- テスト専用Rules `network/emulator/DRAFT_ONLINE_E2E_TEST_ONLY.rules.json` はドラフトルームだけに使用。既存 `ONLINE_E2E_TEST_ONLY.rules.json` のドラフトルート拒否設定は一切変えません。
- エミュレーター用RulesはゲストによるHP書換を技術的に禁じていません。現段階では2人の信頼できるプレイテストを模した検証であり、本番用の認証・権限設計を別途行う必要があります。
- ルームへの本番接続・Firebase Rules本番変更・学校Google Sitesへの埋め込み・公開HTML生成は未実施。

## テスト
1. `node tests/draft-online-duel-core.cjs` : 勝者先攻・重複不可・3枚の継続/入れ替え・通常攻撃フック・HTML構文・分離確認。
2. `node tests/draft-online-duel-webkit.cjs` : 2台のSafari系WebKit実ブラウザとローカルFirebase間でルーム作成→準備→オンラインドラフト4回→3勝終了を検証。ラウンド勝敗は**テストで強制確定する**ため、実プレイの射撃バランスは証明しません。
3. `node tests/sites-friends-release-freeze.cjs` : 公開中の通常版ファイルを保護。

## 次の段階
WebKitエミュレーター試験が安定したら、ドラフト選択中の切断・再接続と同期競合を補強。オンライン対戦自体の射撃やボマー勝敗によるラウンド移行を追加E2E化。その後、独立した公開用HTML/適切なFirebaseの接続・認証・Rulesの準備について本人の承認を得る。実機iPadとGoogle Sitesでの友達対戦テストはその後。
