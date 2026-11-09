# Scramble Notes

3×3×3の苦手なスクランブルを記録し、タグで絞り込んで繰り返し練習する日本語Webアプリです。React / TypeScript / Vite / IndexedDB。バックエンド、アカウント、外部API、クラウド同期は使用しません。

## ローカル起動

Node.js 22.22.2以降の22 LTS、pnpm 11.25.0を使用してください。

```sh
npm install -g pnpm@11.25.0
pnpm install --frozen-lockfile
pnpm dev
```

表示された `http://127.0.0.1:5173/` を開きます。

```sh
pnpm test       # データ保存・復元と画面操作のテスト
pnpm build      # TypeScript検査 + 本番ビルド → dist/
pnpm preview    # 本番プレビュー
```

npmでも `npm install` / `npm run dev` は利用できますが、納品物とCIの再現にはpnpmのロックファイルを使用してください。

## GitHub Pagesへの公開

1. GitHubでリポジトリを作成し、このフォルダの中身（`.github` を含む）をリポジトリ直下へ配置します。`node_modules` は追加しません。
2. Settings → Pages → Build and deployment → Source を **GitHub Actions** にします。
3. `main` ブランチへpushします。`.github/workflows/deploy.yml` がテスト・ビルド・公開を実行します。
4. ActionsのDeploy GitHub Pagesが完了したら、Pagesに表示されたURLを開きます。

`actions/configure-pages` が返す `base_path` をViteへ渡すため、リポジトリ名を変更してもサブパスに追従します。ユーザーサイトやカスタムドメインのルート配信にも対応します。デフォルトブランチがmain以外の場合はworkflowのbranchesを変更してください。

サブパスをローカルで確認する場合、ビルドとプレビューに同じ値を指定します。

```sh
BASE_PATH=/roux-practice/ pnpm build
BASE_PATH=/roux-practice/ pnpm preview
# http://127.0.0.1:4173/roux-practice/
```

Windows PowerShellの場合は `$env:BASE_PATH='/roux-practice/'` を設定してから両コマンドを実行します。

## 使い方

- 「スクランブル登録」に記法を貼り付けて登録。タグ・メモは任意です。
- タグは候補から選択、または入力してEnterで追加。未確定の入力も登録時にタグとして保存します。
- 検索文字列、タグのAND/OR、チェック状態を組み合わせて絞り込みます。
- チェックは「今回解いた」の記録です。習得したらアーカイブしてください。両状態は独立しています。
- 「表示中をチェック解除」は現在の検索結果のみ、「全チェック解除」はアーカイブを含む全件が対象です。
- アーカイブ画面から練習リストに復元できます。タグ管理で名前の変更・全記録からの解除ができます。
- バックアップ画面のJSON保存で全データを保存します。インポートはプレビュー後に追加／全置換を選べます。
- 外観は端末設定・ライト・ダークから選択。スマートフォンではバックアップ画面で変更できます。

## PWA / オフライン

本番ビルドはService WorkerとWeb App Manifestを生成します。HTTPSのGitHub Pagesで一度読み込みを完了すると、アプリ本体と主要機能をオフラインで使用できます。開発サーバーではService Workerを登録しません。

Chromeなどはブラウザのインストールメニュー、iOS Safariは共有メニューの「ホーム画面に追加」を使ってください。新しいバージョンはオンライン時に自動更新されます。初回アクセス直後、キャッシュ完了前のオフライン起動はできません。

## 保存上の注意

データはその端末・ブラウザ・オリジンのIndexedDBに保存されます。別端末・別ブラウザ・別ドメインへは自動転送されません。ブラウザの保存データ削除、プライベートモード終了、容量整理などで消える場合があります。定期的にJSONを保存し、実際にファイルが保存されたことを確認してください。

最終エクスポート日時と外観設定のみlocalStorageに保存します。最終エクスポート日時はダウンロード開始時刻であり、ファイル保存完了を保証しません。バックアップの対象は全スクランブルとタグです。外観・検索条件・最終エクスポート日時は復元対象外です。同時編集の競合を避けるため、編集は1つのタブで行ってください。

データ仕様は [DATA_FORMAT.md](DATA_FORMAT.md)、検証結果は [VERIFICATION.md](VERIFICATION.md) を参照してください。
