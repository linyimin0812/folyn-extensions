[English](README.md) | [简体中文](README.zh.md) | [日本語](README.ja.md) | [Français](README.fr.md) | [Deutsch](README.de.md) | [Español](README.es.md)

# folyn-extensions

Zentrales Verzeichnis des [Folyn](https://github.com/linyimin0812/folyn)-Extension-Store.

Dieses Repository enthält eine einzige Datei: [`catalog.json`](./catalog.json) – sie listet alle installierbaren Extensions auf. Die Folyn-App ruft diese Liste von `https://raw.githubusercontent.com/linyimin0812/folyn-extensions/main/catalog.json` ab und lädt die Installation aus den GitHub-Releases der jeweiligen Extension-Veröffentlicher herunter.

## Aufgenommene Extensions

| id | Beschreibung | tier |
|---|---|---|
| `folyn-rich-text` | Rich-Text-Editor: ProseMirror + HTML-Export | trusted |
| `folyn-dbml` | DBML-Datenbankmodellierung: CodeMirror-Editor + ER-Diagramm-Vorschau | trusted |
| `folyn-file-viewer` | Universeller Dateibetrachter (Office/PDF/CAD/Archiv/Medien), Fallback-FileType-Erweiterung | trusted |

## Extensions beitragen

Der Prozess für Dritte, Extensions in diesem Store zu veröffentlichen, ist in [CONTRIBUTING.md](./CONTRIBUTING.de.md) beschrieben.

Kurz: Erweiterung als zip packen und im eigenen GitHub-Release veröffentlichen → PR an dieses Repository einreichen, um in `catalog.json` einen Eintrag hinzuzufügen (`downloadUrl` zeigt auf deinen Release) → Maintainer prüfen manifest/Berechtigungen/tier und mergen.
