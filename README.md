# BRAWL 2vs2 BOT練習｜GitHub Pages配布用

- `index.html` は元の `Brawl_V3_2vs2_ALPHA10.html` を基にした、通信なしのBOT練習専用版です。
- 元版・戦闘処理・BOTロジックは保持し、オンライン対戦用UIを非表示にしました。
- オンライン接続を行う `ensureDB` は意図的に拒否する実装へ変更。Firebase本番DBのURLは含めていません。
- CSPでネットワーク接続も拒否します。ゲームは通信なしのローカルエミュレーションで動きます。
- Google Sites公開版、既存オンライン版、Firebase Rulesには一切触れません。
- 実機iPhone Safariや学校iPadでの操作確認は別途必要です。

## GitHub Pagesでの公開（ユーザーが作業する部分）

1. GitHubで `brawl-bot-playtest` のような **新規の Public リポジトリ**を作る（既存の他プロジェクトとは分離）。
2. このZIPの `index.html` をリポジトリのルートへアップロードし、Commitする。
3. `Settings` → `Pages` → `Build and deployment` → `Deploy from a branch`、`main` / `/(root)` → Save。
4. 数分後、Pagesの画面に出るリンクをSafariで開く。一般的なリンク形式は `https://<ユーザー名>.github.io/<リポジトリ名>/` だが、実際のURLはPages設定画面で確認する。
5. `BOT対戦を開始 · 通信なし` → キャラやモードを選択 → READY。

## 重要

- **Publicリポジトリは全世界から閲覧可能**。画像・設定・ソースなど見られて困る情報を追加しない。
- オンライン対戦はこの公開版に含めていない。Firebaseや学校での対戦は既存版を別管理する。
- 今後修正版 `index.html` を同じリポジトリへコミットすると同じURLで更新できる（表示には再読み込みやキャッシュ更新が必要な場合がある）。