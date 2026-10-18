# 割り勘ノート

旅行・イベント・家計で使える、個人精算と共同グループ台帳のiOSアプリです。React Native + Expoで実装しています。

## 機能

- 参加者、負担比率、立替額から負担額と送金先を計算
- 精算履歴の端末保存、再表示、削除、共有
- Supabaseを使ったグループ台帳、招待リンク、支出・チェックリストの共同編集
- 50通貨の支出入力と手入力の換算レート
- レシート画像の端末内OCR、確認後のグループ共有保存
- 匿名グループアカウントとアカウント削除

個人精算は端末内のみで動きます。共同グループ機能ではSupabaseのDatabase、Auth、Realtime、Storageを利用します。広告SDK、Analytics SDK、アプリ内課金は含みません。

## ローカル起動

Node.jsを用意し、プロジェクトルートで実行します。

```powershell
npm install
npx expo install --check
npm run typecheck
npx expo start
```

グループ機能を使う場合は `.env.example` を `.env` にコピーし、SupabaseのProject URLとPublishable keyを設定してください。`.env` はGitに登録しないでください。`service_role` / secret keyはクライアントアプリに設定しないでください。

## Supabase

Database、匿名サインイン、レシート用Private Storageの設定は [`docs/SUPABASE_SETUP.md`](docs/SUPABASE_SETUP.md) を参照してください。App Store提出前にアカウント削除用の追加マイグレーションとEdge Functionを適用する必要があります。

## iOS EAS Build

Bundle IDは `com.kazumax71.warikanseisan` です。Expoアカウント `kazumax71` のEASプロジェクトにリンク済みです。

```powershell
npx eas-cli@latest login
$localEnv = Get-Content .env | ConvertFrom-StringData
npx eas-cli@latest env:set --name EXPO_PUBLIC_SUPABASE_URL --value $localEnv.EXPO_PUBLIC_SUPABASE_URL --environment production --visibility plaintext
npx eas-cli@latest env:set --name EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY --value $localEnv.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY --environment production --visibility plaintext
npx eas-cli@latest build --platform ios --profile production
npx eas-cli@latest submit --platform ios --latest
```

`EXPO_PUBLIC_` 値はアプリのJavaScriptに含まれる公開値です。サービス用secret keyを登録しないでください。iOS production buildをApp Store ConnectへアップロードするとTestFlightで確認できます。App Storeでの一般公開は、App Store Connectで掲載情報を完成させ、App Reviewに提出して承認された後に行います。

## 公開ページ

`docs/` はGitHub Pages用です。GitHubの **Settings → Pages** で、ブランチ `main` のフォルダー `/docs` を公開してください。

- プライバシーポリシー: `https://kiks4tennis-hash.github.io/warikan-app/privacy-policy.html`
- サポート: `https://kiks4tennis-hash.github.io/warikan-app/support.html`
