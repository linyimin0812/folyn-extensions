[English](README.md) | [简体中文](README.zh.md) | [日本語](README.ja.md) | [Français](README.fr.md) | [Deutsch](README.de.md) | [Español](README.es.md)

# folyn-extensions

Le catalogue central du store d'extensions [Folyn](https://github.com/linyimin0812/folyn).

Ce dépôt contient un seul fichier : [`catalog.json`](./catalog.json) — qui répertorie toutes les extensions installables. L'application Folyn récupère cette liste depuis `https://raw.githubusercontent.com/linyimin0812/folyn-extensions/main/catalog.json` et télécharge chaque extension depuis les Releases GitHub du propre dépôt de chaque éditeur d'extension.

## Extensions incluses

| id | description | tier |
|---|---|---|
| `folyn-rich-text` | Éditeur de texte enrichi : ProseMirror + export HTML | trusted |
| `folyn-dbml` | Modélisation de base de données DBML : éditeur CodeMirror + aperçu du diagramme ER | trusted |
| `folyn-file-viewer` | Visionneuse de fichiers universelle (Office/PDF/CAD/archives/médias), extension FileType de repli | trusted |

## Contribuer aux extensions

Voir [CONTRIBUTING.md](./CONTRIBUTING.fr.md) pour le processus de publication d'extensions par des tiers vers ce store.

En bref : empaquetez votre extension sous forme de zip et attachez-la à votre propre Release GitHub → ouvrez une PR contre ce dépôt en ajoutant une entrée à `catalog.json` (avec `downloadUrl` pointant vers votre Release) → les mainteneurs examinent le manifest / les permissions / le tier et fusionnent.
