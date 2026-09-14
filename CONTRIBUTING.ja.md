[English](CONTRIBUTING.md) | [简体中文](CONTRIBUTING.zh.md) | [日本語](CONTRIBUTING.ja.md) | [Français](CONTRIBUTING.fr.md) | [Deutsch](CONTRIBUTING.de.md) | [Español](CONTRIBUTING.es.md)

# Folyn ストアへの拡張貢献

本リポジトリは [Folyn](https://github.com/linyimin0812/folyn) 拡張ストアの**中央カタログ**です。ルートの `catalog.json` がインストール可能なすべての拡張をリストします。各拡張の zip パッケージは**公開者自身の GitHub リポジトリ**の Releases でホストされ、Folyn アプリは本カタログからリストを取得し、公開者のリポジトリからダウンロードしてインストールします。

サードパーティでも拡張を貢献できます：拡張を zip にまとめ、自分の GitHub Release に公開し、本リポジトリに PR を送って `catalog.json` に1件を追加します。メンテナが manifest / 権限 / tier を審査した上でマージすると、すべてのユーザーのストアに表示されるようになります。

---

## 公開手順（サードパーティ）

### 1. 拡張をビルドする

[Folyn 拡張開発ドキュメント](https://github.com/linyimin0812/folyn/blob/main/docs/extension-store.md) に従って拡張を開発し、`dist/` ディレクトリを生成します。`dist/` の**ルート**には `manifest.json` が必須です（Folyn はインストール時に zip のルートから manifest を読みます）。

### 2. zip を作る

`dist/` の**中身**（`dist` フォルダそのものではなく）を zip にまとめ、`manifest.json` が zip のルートに来るようにします：

```sh
cd path/to/your-extension/dist
zip -r -X <id>-<version>.zip . -x "*.DS_Store"
```

検証：
```sh
unzip -l <id>-<version>.zip | head   # manifest.json がルートにあり、ディレクトリプレフィックスがないこと
```

**zip の内容の制約**（Folyn はインストール時に `extract_zip_filtered` で強制し、違反するとインストールを拒否します）：
- ❌ ソースコード：`src/`、`*.ts`
- ❌ 設定/ロックファイル：`package.json`、`package-lock.json`、`pnpm-lock.yaml`、`tsconfig.json` など
- ❌ `node_modules/`
- ❌ シンボリックリンク、絶対パス、`..` パス（zip-slip 防護）
- ⚠️ 単一ファイル > 50 MB、合計 > 100 MB、> 1000 エントリは拒否されます

### 3. GitHub Release を作る

拡張リポジトリで tag `<id>-<version>`（例：`my-ext-0.2.0`）を作成し、zip を Release asset としてアップロードします：

```sh
gh release create <id>-<version> <id>-<version>.zip \
  --repo <your-github-username>/<your-extension-repo> \
  --title "<id> <version>"
```

asset の直接ダウンロード URL を記録します。形式：
```
https://github.com/<your-github-username>/<your-extension-repo>/releases/download/<id>-<version>/<id>-<version>.zip
```

> ⚠️ ダウンロード URL の host は**必ず `github.com`** にしてください。Folyn の `install_extension_from_url` コマンドは `github.com` のみを許可し（SSRF 防護）、それ以外の host は拒否されます。Release asset は `objects.githubusercontent.com` へ 302 リダイレクトしますが、ダウンロード側が自動的に追跡するため対応不要です。

### 4. 本カタログに PR を送る

本リポジトリを fork し、`catalog.json` を編集して、`extensions` 配列の末尾に1件追加します：

```json
{
  "id": "my-ext",
  "name": { "zh": "我的扩展", "en": "My Extension" },
  "version": "0.2.0",
  "description": { "zh": "一句话说明扩展做什么", "en": "One-line description" },
  "tier": "sandbox",
  "author": "your-github-username",
  "icon": "<svg viewBox="0 0 16 16" ...>...</svg>",
  "downloadUrl": "https://github.com/<your-github-username>/<your-extension-repo>/releases/download/my-ext-0.2.0/my-ext-0.2.0.zip"
}
```

> `name`/`description` は純文字列（例：`"name": "DBML"`）でも書けます。その場合はすべての言語でその文字列が表示されます。多言語オブジェクトの場合はユーザーの現在の言語でレンダリングし、欠落時は zh → en → 最初の利用可能なものへフォールバックします。`icon` は拡張の `manifest.json` の `icon` と一致させるべきです——拡張の `.svg` アイコンファイルの内容をそのまま貼り付ける（または同じ emoji を使う）ことを推奨します。

フィールドの説明：

| フィールド | 説明 |
|---|---|
| `id` | zip 内の `manifest.json` の `id` と一致すること；kebab-case；グローバルに一意（重複確認は後述） |
| `name` / `version` / `description` / `author` | 表示用；`version` は Release tag と一致。`name`/`description` は純文字列（すべての言語でフォールバック）または `{ "zh": "...", "en": "..." }` の多言語オブジェクトで、アプリは現在の locale で解釈します（フォールバック：現在の locale → zh → en → 最初の利用可能なもの） |
| `tier` | `sandbox`（独立した origin の iframe、制限あり）または `trusted`（メインプロセス、ホストの全機能、インストール後にユーザーがアプリ内で「承認」して TOFU を認可する必要あり） |
| `icon` | 拡張の `manifest.json` の `icon` と**一致すること**：inline SVG テキスト（拡張の `.svg` ファイルの内容を貼り付け）または emoji。インストール済みの拡張はローカルから SVG を読み、ストアは catalog からレンダリングします——両側を一致させることで、ストアとインストール済みリストで同じアイコンが表示されます |
| `downloadUrl` | 自分のリポジトリの Release asset の直接 URL。host は `github.com` であること |

PR を送り、拡張の機能、宣言した権限、この tier にした理由を記述します。

---

## メンテナの審査 checklist

PR のマージ前に各項目を確認します：

- [ ] **id が一意**：`catalog.json` 内に重複する `id` がなく、公式拡張（`folyn-rich-text` / `folyn-dbml` / `folyn-file-viewer`）と衝突しないこと
- [ ] **id が妥当**：`manifest.json` の `id` が catalog エントリの `id` と一致；kebab-case、`.` / `/` / `\` なし（`is_valid_extension_id`）
- [ ] **downloadUrl**：host が `github.com`；tag/asset 名がエントリの `version` と一致；`curl -sIL` が 200 + `content-type: application/zip` を返すこと
- [ ] **manifest が妥当**：`manifest.json` が zip のルートにある；`id`/`name`/`version`/`tier`/`main` が揃っている；`validate_manifest` が通ること
- [ ] **tier が適切**：`sandbox` で済むなら `trusted` にしない。`trusted` はメインプロセスの全機能を持ちます（vault の読み書き、Tauri コマンドの呼び出し、すべての React state へのアクセス）——深い統合が本当に必要な拡張にのみ許可します
- [ ] **権限が最小**：`permissions.fs`/`http`/`vault` などを必要に応じて宣言、origin allowlist にワイルドカードを含まない；`contributes` の宣言が機能と一致すること
- [ ] **zip がクリーン**：`src/`、`*.ts`、`package*.json`、`node_modules` がない；シンボリックリンクがない；サイズが制限内（単一ファイル ≤50 MB / 合計 ≤100 MB / ≤1000 エントリ）
- [ ] **icon が manifest と一致**：catalog の `icon` は拡張の `manifest.json` の `icon` と同源（同じ inline SVG または同じ emoji）であること。そうでないとストアとインストール済みリストで異なるアイコンが表示されます
- [ ] **多言語**：`name`/`description` は少なくともユーザーが使いそうな言語を提供；純文字列をすべての言語のフォールバックとしても可
- [ ] **署名**（任意）：`signature` + `publisherPublicKey` が付いている場合、署名が一致することを検証（`verify_extension_signature`）；欠落時は SHA-256 integrity でフォールバックし、MVP では強制しません
- [ ] **ローカル試しインストール**：アプリの「インストール済み」ページで「.zip からインストール」を使い、該当 zip で一度実行し、インストール・アクティベート・貢献ポイントの登録が正常か確認すること

審査を通過したら PR をマージします。ユーザーが次にストアを開く（または「更新」を押す）と、新しい拡張が表示されます。

---

## 公開済みの拡張を更新する

新バージョンの公開 = 自分のリポジトリで新 tag `<id>-<new-version>` を作り + 新しい zip asset をアップロードし、さらに本リポジトリに PR を送って `catalog.json` の該当エントリの `version` と `downloadUrl` を更新します。Folyn MVP はバージョン比較の更新通知を行いません——インストール済みのユーザーは「インストール済み」ページでアンインストール後に再インストールするか、直接上書きインストールしてください（`install_extension_zip` は wipe + new なので、上書きで構いません）。

## 取り下げ

`catalog.json` からエントリを削除するだけです。インストール済みの拡張には影響しません（ローカルの `extensions.json` と `~/.folyn/extensions/<id>/` は保持され、ユーザーが手動でアンインストールできます）。
