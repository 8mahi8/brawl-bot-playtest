# BRAWL — オンライン統合計画 / 学校iPadリリース条件

更新日: 2026-10-12。**このドキュメントの作成はオンライン移植完了を意味しない。**

## 2026-10-12 — 2人用/4人用は通信実装を強制統合しない

方針：ユーザーの要望により**共通化は利益がある箇所だけ**。戦闘ロジックは共有するが、通信については1vs1と2vs2それぞれの権限・人数・切断復帰・更新頻度の要件を優先し、必ずしも同じクラス/実装にしない。

- [別々の通信設計とオンライン元版の調査](./network/README.md)を記録。Driveの1vs1 V2.8と2vs2 ALPHA10を参照し、両方の位置更新が80ms基準、2vs2のホスト管理ループが100ms基準であることを確認。ALPHA10は4席＋connectionId/presence/life/motionRevを用いるが、V2.8の位置payloadはシンプルなhost/guest/round/seq方式。旧版は保護。
- [1vs1独立通信モデル](./network/lab/one-vs-one.cjs)と[2vs2独立通信モデル](./network/lab/two-vs-two.cjs)を、**実Firebaseに接続しない**隔離ラボとして実装。
- [接続安全性テスト](./tests/network-mode-isolation.cjs)、[疑似遅延負荷](./tests/network-latency-simulation.cjs)、[公開BOT隔離](./tests/network-public-isolation.cjs)と[専用CI](./.github/workflows/network-mode-lab.yml)を実装。位置の古い/逆順受信、別ルーム、再接続、世代/復活、書き込みのまとめ方を検証。
- 2秒間・描画16ms・送信80msの模擬処理は位置書き込み1vs1=52件、2vs2=104件（4人で倍）。0/150/300/600msは**人工遅延**であり、実Firebaseの性能・遅延許容値を測った結果ではない。
- 現行のオンライン・Firebase/Rules・Google Sites・iPad実機は変更していない。**運用版の通信高速化は未実施**。本番用のネットワーク接続先や認証情報を公開GitHubに移さない。
- 次段階はモード別に遅延/負荷を計測するための隔離実機候補を作り、ホスト戦闘transactionと位置配信を分けて測定する。更新頻度は計測後に決める。

## 実ファイルの所在と分岐
- オンライン実装の参照: Google Drive保存済みの `Brawl_V3_2vs2_ALPHA10.html` （`PROTOCOL=3010`、Firebase RTDBを利用するコードがある）。旧オンライン作業物として凍結・保護。
- 1vs1の保護基準: Google Drive保存済みの `Brawl_V2_8_TEST.html` （`PROTOCOL=28`）。学校Google Sitesの現行公開コードとバージョンが同じかは未確認、勝手に上書きしない。
- GitHub PagesのCombat Evolution / R2は **Firebase通信を無効化したBOT版**。2vs2 Combat Evolution は `PROTOCOL=3011`、R2ではそれにBOT戦術改善を加えている。
- 保存先は必ず分離: 1vs1 `/rooms`、2vs2 `/rooms2v2`。比較候補と旧プロトコルのルームを混在させない。
- 両Driveファイルの存在とFirebase接続コードの有無は確認済みだが、**現行Google Sites実ページ・Firebase Rules/Auth・リアルタイム接続結果は未確認**。
- 公開GitHubに実Firebaseの接続URL、ルームデータ、Rules、認証情報や学校固有の設定を書き出さない。

## 技術的な統合方針
1. 実オンライン候補を**保護された別ファイル・別バージョン**で作成。既存1vs1公開物・ALPHA10 HTML・本番DBの設定を直接変更しない。
2. まず戦闘コアのルール差を閉じる。特にガンナー時間差3連射の発射位置と受理時間、タンク散弾角、ヒット/リロード/ガジェット/ULTの境界を自動テストで比較する。
3. BOTからオンラインへの移植では、見た目の弾予測は即時でも**HP・弾薬消費・ヒット・結果の正本をホスト確定の `game` に置く**。弾の予約/発射時刻/命中ID/強制移動を一貫したcombat revisionで処理。
4. 位置入力はクライアント予測として送る。ホストの強制移動を `motion revision` で優先。古い接続・過去ラウンド・重複イベントが後勝ちしない。
5. PAUSE/再接続時の共有戦闘時計、弾飛行の凍結、ホスト交代の競合・lease/epoch、同時KOのDRAW公平性を検証。見た目補間だけで不整合を隠さない。
6. **実Firebaseの最初の検証は隔離したテストDB/階層と適切なRules/Authのレビュー後**。本番Rulesを全面公開に変更して試験しない。5桁ルームIDは認証にならない。
7. ネットワーク遅延、再送、イベント順、切断復帰を使った複数クライアント故障注入を先に行い、その後学校iPad Safari / Google Sitesで確認する。

## 必須テスト・証拠
| ゲート | 具体的に確認するもの | 2026-10-12 |
| --- | --- | --- |
| Offline JS | KO/AREAの判定、回復、弾とBOT挙動 | R2ロジックテストPASS（実機評価なし） |
| Browser end-to-end | 起動→移動→攻撃→勝敗→再戦を複数回、描画と入力の目視 | 未検証 |
| iPad display/control | Google Sites埋め込み領域、画面回転、HUDはみ出し、アナログ移動、連打・指キャンセル | 未検証 |
| Security | RTDB Rules/Auth・認証なし書込の可否・別ルームや他人の席の改ざん阻止 | 未検証 |
| 4 clients | 4人READY、両モード、弾/HP/ULT一致、150/300/600ms遅延、再戦 | 実Firebase未検証 |
| Connection recovery | Safari再読み込み、スリープ、復帰期限、ホスト切断と交代、古い接続の排除 | 実Firebase未検証 |
| Data/load/cost | 位置送信80ms基準から測るRTDBの送信/受信バイト、トランザクションリトライ、同時接続、保持データ容量 | 未測定 |
| Final school network | 学校iPadのSafari+実Google Sites+複数端末+学校回線で最低数試合 | 未実施 |

## テストの進め方 / 運用規律
- GitHubの旧安定版とR2の比較リンクを維持。全改変で個別・統合・回帰テストを実施する。
- 各候補を「コード変更」「JavaScriptテスト」「ブラウザ検証」「学校iPad実機」「Firebase実通信」の5段階で明記する。
- オンライン連携のデータ送信を伴う試験、Google Sites公開ページの書換え、Firebase Rules/DBの変更は、対象環境と影響を確認し必要な承認を得てから行う。
- ライブ端末のFPSとRTDB転送量を独立に記録。低通信量でも入力遅延があるなら未合格。古いイベントでステルスが露出しないことも確認。
- 実機評価を受けて戦闘バランスを調整し、改善が本当に面白さにつながるまで候補として扱う。

参考: [COMBAT_EVOLUTION_R2_RELEASE_NOTES.md](./COMBAT_EVOLUTION_R2_RELEASE_NOTES.md)、[BRAWL_MODE_PARITY_AUDIT.md](./BRAWL_MODE_PARITY_AUDIT.md)。
