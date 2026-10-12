# BRAWL — オンライン統合計画 / 学校iPadリリース条件

更新日: 2026-10-12。**このドキュメントの作成はオンライン移植完了を意味しない。**

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
