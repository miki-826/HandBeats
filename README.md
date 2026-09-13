# Hand Beat

**その手で、音を掴め。** Webカメラに表示されたノーツへ手を動かし、円が重なる瞬間に ✊ / 👉 / ✋ をつくるリズムゲームです。

Next.js / TypeScript / MediaPipe Hand Landmarker / Web Audio API / Supabase。PC・ノートPCのChrome / Edgeを主対象としています。

## 起動

Node.js 24 と npm を使用します。

```sh
npm ci
npm run dev
```

http://127.0.0.1:3000 を開き、START → 曲・難易度 → カメラ確認 → プレイ。音源・認識モデルは同梱済みです。Supabase未設定でもローカルプレイ、結果、自己ベスト保存が使えます。

```sh
npm run lint
npm run typecheck
npm test
npm run build
npm run start
npm run test:e2e
```

ローカルE2Eはインストール済みMicrosoft Edgeを使用します。CIはPlaywright Chromiumを使用します。E2Eで使う模擬カメラと音声クロックはテストファイル内にのみ存在し、本番コードにテスト用URL・スコア入力の抜け道はありません。

## 素材確認と固定譜面

作業開始時点のリポジトリは `仕様書.md` と `資料/music/` のMP4楽曲4点のみでした。既存コード・設定・効果音・画像素材はありません。仕様書の素材に関する旧記述より、ユーザーの「楽曲のみ」という指示を優先しました。

| ID | 楽曲 | 音声長 | BPM（解析採用値） | EASY | NORMAL | HARD |
|---|---|---:|---:|---:|---:|---:|
| song-01 | 靴ひもを結ぶ朝 | 174.266秒 | 95 | 121 | 257 | 298 |
| song-02 | ワン・ツー・スリーで笑顔満開！ | 157.989秒 | 127 | 147 | 311 | 356 |
| song-03 | ゆっくりでいい | 172.989秒 | 72 | 91 | 190 | 219 |
| song-04 | これが私だ | 154.320秒 | 172 | 193 | 300 | 383 |

ノーツ数を難易度列に記載しています。全曲AAC-LC / 44.1kHz / ステレオ。原本のMP4には映像と字幕トラックも含まれますが、ゲームには音声のみを使用します。`ffmpeg -vn -c:a copy` で `public/assets/songs/<id>/audio.m4a` に無再圧縮抽出しました。原本SHA-256、スペクトルフラックスによるテンポ候補、4秒区間のエネルギー、譜面密度を変えた区間は `docs/audio-analysis.json` に記録しています。

譜面は音声の打点近傍へ最大45ms補正し、強い区間のNORMAL/HARDを密にしています。72/144や86/172など倍半テンポの候補から、曲のフレーズとゲーム密度に適した値を採用しています。解析に基づく初版であり、人による全譜面の打感・サビ区間の最終監修は未実施です。試遊調整する際も必ずバージョンを上げてください。

`src/data/songs/<id>/{easy,normal,hard}.json` は固定済みです。ゲーム開始時・ビルド時にノーツを生成しません。同一 `songId + difficulty + chartVersion` のJSONを常に読みます。

- `src/data/chart-lock.json` が全譜面のSHA-256を固定。
- ビルド前にデータ・メタデータ整合性・ハッシュを検証。
- 各譜面を10回読み込むテストで同一性を検証。
- CIはPRのベースまたは前回pushから、公開済みのハッシュ変更・削除を拒否。
- 譜面、ノーツ位置・時刻・種類・数・offset変更は `chartVersion` を増やします。過去のlockエントリを残し、新キーを追加します。
- 判定幅、スコア計算、位置許容を変える場合は `scoreVersion` を増やします。ランキングは4つのキーで分離されます。

`scripts/prepare-audio.mjs`、`analyze-audio.py`、`author-charts.py` は制作時専用です。通常起動・ビルドでは実行しません。再解析にはPython 3.12とNumPyが必要です。authorスクリプトは既存v1ハッシュが変わる書き込みを拒否します。新バージョンは制作者が明示して編集してください。

## 遊び方と実装

- 手のひら中心が指定領域に入り、正しい形へ**切り替わった瞬間**を入力にします。同じ形を維持しても連打されません。
- OPENは親指以外の3本以上が伸びていれば認識し、少し曲がった指にも対応します。未分類の「HAND」表示は廃止。確定した形を表示し、3フレーム以内の未分類では解除しません。4フレーム連続の未分類、または200ms超の手の消失で解除します。分類不能な形そのものを得点入力にはしません。
- 拍手操作を廃止し、全12譜面をv2へ更新。旧拍手ノーツは前後と異なる手の形に置き換え、時刻・位置・ノーツ数を維持しています。旧v1のハッシュは保存しています。
- PERFECT ±80ms / GREAT ±150ms / GOOD ±250ms。判定領域は正規化座標でEASY .18 / NORMAL .145 / HARD .12。
- 楽曲はAudioBufferSourceNode、時間はAudioContext.currentTime、描画はrequestAnimationFrame。推論はWeb Workerで最大2手、約30fps。HUDは約10fpsで更新し、ランドマークをReact stateへ保存しません。
- カメラとノーツCanvasは同じcontain矩形を使用し、4:3映像でもトリミングによる位置ずれを防止。左右反転を共通関数で適用します。
- `src/lib/audio/hitSounds.ts` でアタックと胴鳴りを重ねたKick / Snare / Hi-Hatを合成。Perfect / Great / Goodで即時再生し、マスターリミッターで楽曲との重なりを制御します。`HitSoundBank`を実装する音源バンクに差し替えればWAV化できます。
- Esc・ボタン・別タブへの移動・音声停止でポーズ。ポーズしたプレイはランキング対象外です。復帰は2秒カウントダウン。
- カメラなし操作体験はカーソル＋F/G/Oキー。指の代わりにカーソルの位置を使います。ランキングには送信しません。
- カメラ映像を送信・録画・保存しません。カメラ権限はプレイヤーのボタン操作時のみ要求し、退出時にトラックを停止します。

認識閾値は `src/game/config.ts`、姿勢分類は `src/mediapipe/gestureClassifier.ts`、ゲーム判定は `src/game/engine.ts` に分離しています。実際の照明・距離・左右の手で3ジェスチャーを確認してから公開してください。

## ジャケット・新曲追加

青いデジタルステージ「Blue Horizon」に一新しています。内蔵画像生成で制作した透過ロゴ・背景は `public/assets/ui/{hand-beat-logo-v3,blue-arena-v3}.webp`、各曲のバナーは `public/assets/songs/<id>/banner-v3.webp`。全6点の保存先と使用プロンプトは [docs/blue-horizon-artwork.md](docs/blue-horizon-artwork.md) に記録しています。タイトル・選曲・準備・プレイ・結果画面で使用し、画像の日本語タイトルはHTMLで表示します。設定画面のKICK / SNARE / HI-HATボタンでヒット音を試聴できます。

ジャケット画像はメタデータの `jacket` で指定します。横長バナーを `public/assets/songs/<id>/` に配置し、その公開パスを設定して再ビルドします。画像が壊れていた場合は曲ごとのCSSアートへフォールバックします。

新曲は `public/assets/songs/<new-id>/audio.*` と `src/data/songs/<new-id>/metadata.json`、3譜面を追加します。既存メタデータに従い `id/title/artist/bpm/durationMs/audio/jacket/previewStartMs/color/mood/difficulties` を記載します。ディレクトリから自動検出するため曲一覧のコード変更は不要です。新キーのSHA-256をlockに追加し、`npm run validate:charts` を通してください。

## Supabase接続

1. SupabaseプロジェクトのSQL Editorで `supabase/migrations/001_hand_beat.sql` を実行。
2. Authentication設定でAnonymous Sign-Insを有効化。公開前にレート制限・CAPTCHAの運用設定を検討してください（CAPTCHAを必須にする場合はフロントのトークン入力連携が別途必要です）。
3. `.env.example` を `.env.local` へコピーし、次の値を設定。

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_KEY
SUPABASE_SECRET_KEY=YOUR_SECRET_OR_SERVICE_ROLE_KEY
```

4. サーバーを再起動。匿名Authでユーザーを作成し、カメラプレイ開始時にサーバー発行セッションを紐付けます。RESULTで表示名を入力し、登録ボタンを押してください。

最終scoreは受け付けません。正規譜面とのID・順番・種類・時間・位置・判定整合性、ユーザー所有権、有効期限、曲長に対する経過時間を検証して再計算します。SQLトランザクションでセッション消費と結果保存を同時に行うため、二重送信で重複記録が作られません。1人1譜面の最高スコアだけをランキングViewが返します。Secretはserver-onlyモジュール内でのみ参照します。

ブラウザで計算するため、合成した完璧な入力イベントを完全に排除する仕組みではありません。カメラ映像を送信しない設計の範囲で、仕様書に沿った整合性検証を行います。

## GitHub / Vercel

リポジトリ: https://github.com/miki-826/Hand-Beats

1. Vercelで既存GitHubリポジトリをImport。FrameworkはNext.js、Root Directoryはリポジトリルート、Node.jsは24。
2. 上記3つの環境変数をPreview / Productionに設定。ランキングが不要なら未設定のままでも起動可能。
3. Production Branchをmainに設定。main更新が本番、`feature/*` のPRがPreviewとなります。
4. GitHub Actionsの `Hand Beat checks` を必須チェックにすることを推奨。lint / typecheck / unit・integration / build / E2Eを実行します。

Vercel/GitHubの接続設定、Supabaseプロジェクト作成・秘密キー設定はリポジトリ内のコードだけでは完了しません。接続後、実際のAuth・REST・ランキング登録・Preview URLを検証してください。

## 検証範囲

`tests/unit/`: 時間境界、スコア、コンボ、位置、鏡像・contain矩形、姿勢遷移、廃止ジェスチャーの拒否、全12固定譜面、ランキングキー。

`tests/integration/`: API契約（DB/Authアダプターのモック）と入力改ざん拒否。加えて実際のPostgreSQL WASM（PGlite）上でSQL migration / RLS / 権限 / 原子的登録 / 再利用拒否 / rollback / 最高スコアViewを検証します。Supabaseクラウドへの実接続検証とは区別しています。

`tests/e2e/`: 模擬カメラで実MediaPipeモデルを起動。画面遷移、ポーズ、RESULT、未接続ランキング、カメラ拒否、モデル・音源取得失敗、設定保存、キーボード操作、小画面を確認。

未確認: 実際のプレイヤーの手による全曲試遊、各端末の入出力遅延、実Supabase接続、本番Vercel公開。接続先が整い次第の受入確認項目です。

## 参考・ライセンス

- [MediaPipe公式ドキュメント](https://ai.google.dev/edge/mediapipe/solutions/vision/hand_landmarker/web_js)
- [Next.js公式ドキュメント](https://nextjs.org/docs/app)
- [Supabase Anonymous Auth](https://supabase.com/docs/guides/auth/auth-anonymous)
- [素材・依存関係の出典](docs/THIRD_PARTY.md)
