[English](README.md) | [简体中文](README.zh.md) | [日本語](README.ja.md) | [Français](README.fr.md) | [Deutsch](README.de.md) | [Español](README.es.md)

# folyn-extensions

[Folyn](https://github.com/linyimin0812/folyn) 拡張ストアの中央カタログです。

本リポジトリにはファイルが1つだけあります：[`catalog.json`](./catalog.json) ——インストール可能なすべての拡張をリストします。Folyn アプリは `https://raw.githubusercontent.com/linyimin0812/folyn-extensions/main/catalog.json` からこのリストを取得し、各拡張の公開者自身の GitHub Releases からダウンロードしてインストールします。

## 収録されている拡張

| id | 説明 | tier |
|---|---|---|
| `folyn-rich-text` | リッチテキストエディタ：ProseMirror + HTML エクスポート | trusted |
| `folyn-dbml` | DBML データベースモデリング：CodeMirror + ER 図プレビュー | trusted |
| `folyn-file-viewer` | 汎用ファイルビューア（Office/PDF/CAD/アーカイブ/メディア）、フォールバック FileType 拡張 | trusted |

## 拡張の貢献

サードパーティが本ストアに拡張を公開する手順は [CONTRIBUTING.md](./CONTRIBUTING.ja.md) を参照してください。

概要：拡張を zip にまとめて自分の GitHub Release に公開 → 本リポジトリに PR を送り `catalog.json` に1件追加（`downloadUrl` は自分の Release を指す）→ メンテナが manifest / 権限 / tier を審査した上でマージします。
