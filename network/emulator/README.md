# BRAWL Firebase Realtime Database ローカルエミュレーター試験

**目的:** Firebaseの公式RTDB SDKと実際のエミュレーターを使い、1vs1と2vs2の**独立した**アクセス権・実データ送受信・ホストのトランザクションを検証する。本番Firebase、学校Google Sites、既存の公開ゲーム、Firebase Rulesは**一切変更しない**。

## 使うもの

- [エミュレーター設定](../../firebase.brawl-lab.json)：ローカル`127.0.0.1:9000`のRealtime Databaseだけを起動。プロジェクトIDは仮の`demo-brawl-lab`で、実Firebaseプロジェクトではない。
- [エミュレーター専用Rules](./database.rules.json)：`/lab/pair`と`/lab/squad`のみを試験対象とし、デフォルト拒否。**このRulesは検証用であり、現行の本番Rulesと互換な「正式版」ではない**。
- [公式SDKを使うテスト](../../tests/network-firebase-emulator.cjs)：認証付きのテストコンテキストと匿名コンテキストで、許可/拒否、位置更新、ホスト書き込み、アクションの一回限りの登録、切断・復活時の古い情報の拒否を検証。別クライアントの`value`購読とRTDBトランザクションも実行。
- [GitHub Actions](../../.github/workflows/firebase-emulator-lab.yml)：Java 21、Node.js 22、Firebase CLI・rules-unit-testing SDKを実行時にインストールして検証。**デプロイは行わない。**

ローカルでは、リポジトリルートから以下を実行する。Node.js 22、Java 21が必要。

```sh
npm install --no-save --package-lock=false firebase-tools@14.24.0 @firebase/rules-unit-testing@4.0.1
./node_modules/.bin/firebase emulators:exec --only database --project demo-brawl-lab --config firebase.brawl-lab.json "node tests/network-firebase-emulator.cjs"
```

このコマンドは**本番のFirebase Project ID、認証キー、DB URLを入力しない**。接続先の環境変数は`localhost:9000`または`127.0.0.1:9000`のみ許可しており、SDKテストが通常のクラウドDBへ接続することは拒否する。初期データはルールを無視するテスト専用の管理者コンテキストで作成し、テスト後に破棄する。

## この段階で検証できること

1. **2人用:** host/guestの部屋の読み書きは参加者に限定。自分の位置を正常に書けるが、他人の位置、過去round、seqの巻き戻り、マップ範囲外の座標は拒否される。ゲストはHPやホストUIDを書き換えられない。
2. **4人用:** 4人それぞれが自分の位置と操作を送る。異なる`matchId`、`connectionId`、`life`、`motionRev`、他人の座席へのなりすまし、過去seqや旧接続の再利用を拒否する。
3. **ホスト:** 実DBの`game`に正しい`combatRev`でのみ更新可能。ゲストによるHP改ざんやrevisionの飛び級を拒否する。
4. **クライアント間配信:** 参加者のFirebase SDKが`value`購読でホストのトランザクション後の戦闘状態を受信する。
5. **公開隔離:** 既存のGithub Pages BOT試遊版には接続コードを加えず、`connect-src 'none'`を維持する。既存オンライン版と本番DBには変更なし。

## 重要な限界・次の安全ゲート

- **これはローカルRTDBエミュレーターの統合試験であり、インターネット越しのFirebase本番環境での通信実測ではない。** 学校iPad Safari、Google Sites埋め込み、実ネットワーク遅延や月額費用も検証していない。
- テスト用の`authenticatedContext(uid)`は**模擬認証コンテキスト**であり、実Firebase Authへのサインイン方式やアカウント管理を検証していない。
- ルーム作成、参加承認、UIDとシートの割り当て、presence/接続世代の切替、ホストの再選出は**特権付きフィクスチャーとして投入しただけ**で、本番用の安全な実装はまだない。
- このRulesが制限できるのはクライアントの読み書き権限。**現在の「ホストUIDがHPを書ける」方式は、不正なホストが嘘のHPを送ること自体を防がない。** 信頼できるサーバー/権限モデル（または対戦プロトコルに応じた別の検証方法）が別途必要。ルームIDやUIだけを認可に使ってはいけない。
- 2人・4人の通信実装を無理に共通化しない。共通戦闘コアとモード別のネットワーク権限・presenceを接続する場合は、通信の実測値・攻撃面をそれぞれ検査する。

**次段階:** 実際のオンライン用テストHTMLを本番と別プロトコル・別環境で作り、再接続/ホスト選出・UIへのイベント反映を試す。その後、接続先とRules/Authの妥当性をユーザーに確認して、隔離したクラウドテスト環境の利用を検討する。
