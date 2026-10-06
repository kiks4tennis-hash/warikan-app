# 割り勘ノート — iOS App

参加者、負担比率、各人の立替額から負担額と送金先を計算する、React Native + ExpoのiOSアプリです。

## 含まれるもの

- 会の名前、合計金額、参加者、負担比率、立替額の入力
- 整数円での按分と最大剰余法による端数配分（各人の負担合計は会計合計に一致）
- 立替額と負担額の差から送金指示を作成
- iOS共有シートへの精算結果共有
- 端末内の精算履歴保存・再表示・全削除
- サーバー、アカウント、広告、Analytics、課金SDKなし

## 起動

Node.jsを用意した環境で依存関係を導入し、Expo開発サーバーを起動してください。Expo SDKと依存パッケージの整合が必要なため、インストール時にExpoの診断結果に従い、SDK対応版へ揃えてください。iOS実機で確認する場合はExpo GoまたはDevelopment Buildを利用します。

## App Store提出前に必要な作業

1. `app.json` のBundle IDは `com.kazumax71.warikanseisan` に設定済み。App Store Connectで同じIDを登録する。
2. Apple Developer ProgramとApp Store Connectでアプリを登録し、アイコン、スクリーンショット、説明、年齢区分を設定。
3. `docs/` をGitHub Pagesで公開し、`docs/privacy-policy.html` と `docs/support.html` のURLをApp Store Connectへ登録する。このアプリは精算内容を外部送信しませんが、配信方式や将来追加するSDKに応じて申告を見直してください。
4. iPhone実機で入力、計算、共有、保存/再表示、削除、アクセシビリティを確認。
5. Apple署名済みビルドを作成し、TestFlightで確認してから審査へ提出。

この作業環境ではApple署名済みiOSビルドとApp Store Connectへの最終提出はまだ行っていません。EAS Build/EAS Submitを使えばWindowsからビルドとアップロードを進められます。Xcodeを使った手動ビルド/アップロードを選ぶ場合はMacが必要です。

## MVPの仕様上の範囲

- 会計通貨は日本円、1円単位。
- 立替額の合計が会計総額と一致しない場合は計算しない。
- 負担比率は整数のみ。比率1は標準負担を表す。
- 税/サービス料の自動計算、複数会計、OCR、連絡先連携、送金実行は対象外。
- 同じ名前の参加者は、結果と共有文で `(1)`, `(2)` を付けて区別します。

## GitHub Pages公開

このリポジトリの `docs/` がGitHub Pages用の公開ディレクトリです。GitHubのリポジトリで **Settings → Pages → Build and deployment → Deploy from a branch** を選び、ブランチ `main`、フォルダ `/docs` を指定して保存します。

公開URLは通常、次の形です（`<owner>` はGitHubユーザー名またはOrganization名）。

- トップ: `https://<owner>.github.io/warikan-app/`
- プライバシーポリシー: `https://<owner>.github.io/warikan-app/privacy-policy.html`
- サポート: `https://<owner>.github.io/warikan-app/support.html`

Pagesの公開後、サインインしていないブラウザでも3ページが開けることを確認し、ポリシーURLとサポートURLをApp Store Connectに設定します。

