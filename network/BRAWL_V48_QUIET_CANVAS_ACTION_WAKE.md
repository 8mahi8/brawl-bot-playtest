# BRAWL V4.8｜静止画面で相手の弾が描画されない問題の再現と修正

対象は通常・ドラフトの **生成済み開発用2vs2 HTML**。Google Sitesへの貼替、本番Firebaseデータ/URL/Rules、公開用sites/*.html、Drive、キャラ性能は変更しない。

## 原因となり得るコードパス

1. 相手が射撃し ACTION が Firebase に到着する。V3.7 の earlyShots に弾を一時登録する。
2. ホストが確定した game.projectiles / game.scheduled がまだ到着していない場合、ゲームの正規スナップショットには弾が存在しない。
3. 既存の quietCanvasIdleEligible() はゲーム状態、入力、速度、エフェクトをチェックするが **earlyShots と earlyBombSmoothing を確認していなかった**。
4. プレイヤーが静止している KO または HOT ZONE では shouldDrawCanvasFrame() が画面をスキップし、ACTIONを受けた弾の先行描画だけが表示されない可能性がある。

## 修正

scripts/build-friends-online.cjs の patchSquadQuietEarlyShotWakeV48() を既定の2vs2ステージングHTML生成時に適用する。quietCanvasIdleEligible() に次の軽量な状態確認を追加:

`if(earlyShots.size||earlyBombSmoothing.size)return false;`

生きている早期弾/ボマー引き継ぎがある間は、既存の requestAnimationFrame スケジュールの次フレームでCanvasを通常描画する。**新しいタイマーは設定せず**、描画処理、衝突計算、通信、サーバー時計、ホストの取引やHPには手を加えない。プレビューが消えれば通常の静止描画間引きに戻る。

## 検証

- tests/friends-2v2-quiet-action-wake-v48.cjs：実物の生成された Canvas gate を VM で再生。旧版では16ms後の描画がスキップされる条件を再現し、新版では次フレームを表示する。KO・HOT ZONE、ボマー引継ぎ、弾消滅後の待機復帰、1vs1隔離、元HTML不変を確認。
- 同じFirebase LOCAL emulator / WebKitの通常・ドラフト2vs2、各4人移動・射撃の自動テストと Foundation/Combat リグレッションを維持。
- 学校iPadのWi-Fi・Google Sites環境で効果が出たかは未測定。MDNのrequestAnimationFrameは画面再描画直前のコールバックで、ブラウザーや背景状態に左右されるため、特定の16msを保証しない。

参考：[MDN requestAnimationFrame](https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame)、[Firebase Web Realtime Database](https://firebase.google.com/docs/database/web/read-and-write)。
