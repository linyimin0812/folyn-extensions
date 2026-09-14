[English](README.md) | [简体中文](README.zh.md) | [日本語](README.ja.md) | [Français](README.fr.md) | [Deutsch](README.de.md) | [Español](README.es.md)

# folyn-extensions

The central catalog for the [Folyn](https://github.com/linyimin0812/folyn) extension store.

This repository contains a single file: [`catalog.json`](./catalog.json) — which lists all installable extensions. The Folyn app pulls this list from `https://raw.githubusercontent.com/linyimin0812/folyn-extensions/main/catalog.json` and downloads each extension from the respective extension publisher's own GitHub Releases.

## Included extensions

| id | description | tier |
|---|---|---|
| `folyn-rich-text` | Rich text editor: ProseMirror + HTML export | trusted |
| `folyn-dbml` | DBML database modeling: CodeMirror + ER diagram preview | trusted |
| `folyn-file-viewer` | Universal file viewer (Office/PDF/CAD/archive/media), fallback FileType extension | trusted |

## Contributing extensions

See [CONTRIBUTING.md](./CONTRIBUTING.md) for the process of third parties publishing extensions to this store.

In brief: package your extension as a zip and attach it to your own GitHub Release → open a PR against this repository adding an entry to `catalog.json` (with `downloadUrl` pointing to your Release) → maintainers review the manifest / permissions / tier and merge.
