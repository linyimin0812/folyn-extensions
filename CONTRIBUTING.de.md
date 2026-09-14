[English](CONTRIBUTING.md) | [简体中文](CONTRIBUTING.zh.md) | [日本語](CONTRIBUTING.ja.md) | [Français](CONTRIBUTING.fr.md) | [Deutsch](CONTRIBUTING.de.md) | [Español](CONTRIBUTING.es.md)

# Extensions zum Folyn-Store beitragen

Dieses Repository ist das **zentrale Verzeichnis** des [Folyn](https://github.com/linyimin0812/folyn)-Extension-Store. Die `catalog.json` im Stammverzeichnis listet alle installierbaren Extensions auf; das jeweilige zip-Paket jeder Extension wird in den Releases des **eigenen GitHub-Repositorys des Veröffentlichers** gehostet. Die Folyn-App ruft die Liste aus diesem Verzeichnis ab und lädt die Installation aus dem Veröffentlichungs-Repository herunter.

Jeder Dritte kann Extensions beitragen: Packe deine Extension als zip, veröffentliche sie in deinem eigenen GitHub-Release und reiche einen PR an dieses Repository ein, um in `catalog.json` einen Eintrag hinzuzufügen. Maintainer prüfen manifest / Berechtigungen / tier und mergen – die Extension ist danach für alle Nutzer im Store sichtbar.

---

## Veröffentlichungsprozess (Dritte)

### 1. Extension erstellen

Entwickle die Extension gemäß der [Folyn Extension-Entwicklungsdokumentation](https://github.com/linyimin0812/folyn/blob/main/docs/extension-store.md) und erzeuge ein `dist/`-Verzeichnis. Im **Stamm** von `dist/` muss sich `manifest.json` befinden (Folyn liest das manifest bei der Installation aus der zip-Wurzel).

### 2. zip erstellen

Packe den **Inhalt** von `dist/` (nicht den `dist`-Ordner selbst) in ein zip, sodass `manifest.json` in der zip-Wurzel liegt:

```sh
cd path/to/your-extension/dist
zip -r -X <id>-<version>.zip . -x "*.DS_Store" "*.map"
```

Prüfung:
```sh
unzip -l <id>-<version>.zip | head   # manifest.json muss im Stamm liegen, ohne Verzeichnis-Präfix
```

**zip-Inhalts-Beschränkungen** (werden bei der Folyn-Installation von `extract_zip_filtered` erzwungen; bei Verstößen wird die Installation direkt abgelehnt):
- ❌ Quellcode: `src/`, `*.ts`
- ❌ Source Maps: `*.map` (vite/webpack gibt sie aus; sie leaken Quellpfade und werden hart abgewiesen)
- ❌ Konfigurations-/Lock-Dateien: `package.json`, `package-lock.json`, `pnpm-lock.yaml`, `tsconfig.json` usw.
- ❌ `node_modules/`
- ❌ Symlinks, absolute Pfade, `..`-Pfade (zip-slip-Schutz)
- ⚠️ Einzeldatei > 50 MB, Gesamt > 100 MB, > 1000 Einträge werden abgelehnt

### 3. GitHub-Release veröffentlichen

Erstelle in deinem Extension-Repository den Tag `<id>-<version>` (z. B. `my-ext-0.2.0`) und lade das zip als Release-asset hoch:

```sh
gh release create <id>-<version> <id>-<version>.zip \
  --repo <your-github-username>/<your-extension-repo> \
  --title "<id> <version>"
```

Notiere den direkten Download-Link des assets, in der Form:
```
https://github.com/<your-github-username>/<your-extension-repo>/releases/download/<id>-<version>/<id>-<version>.zip
```

> ⚠️ Der Host der Download-URL **muss `github.com` sein**. Der Folyn-Befehl `install_extension_from_url` erlaubt nur `github.com` (SSRF-Schutz); andere Hosts werden abgelehnt. Release-assets leiten per 302 auf `objects.githubusercontent.com` weiter, was der Downloader automatisch folgt – kein Handlungsbedarf.

### 4. PR an dieses Verzeichnis einreichen

Forke dieses Repository, bearbeite `catalog.json` und füge am Ende des `extensions`-Arrays einen Eintrag hinzu:

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

> `name`/`description` können auch als reiner String geschrieben werden (z. B. `"name": "DBML"`); in diesem Fall wird dieser String für alle Sprachen angezeigt. Ein mehrsprachiges Objekt wird gemäß der aktuellen Benutzersprache gerendert; bei fehlender Übersetzung wird zurückgegriffen auf zh → en → erste verfügbare Sprache. `icon` sollte mit dem `icon` aus der `manifest.json` der Extension übereinstimmen – empfohlen wird, den Inhalt der `.svg`-Icon-Datei der Extension direkt einzufügen (oder dasselbe Emoji zu verwenden).

Feldbeschreibung:

| Feld | Beschreibung |
|---|---|
| `id` | Muss mit der `id` in `manifest.json` innerhalb des zip übereinstimmen; kebab-case; global eindeutig (siehe Duplikat-Prüfung unten) |
| `name` / `version` / `description` / `author` | Zur Anzeige; `version` stimmt mit dem Release-Tag überein. `name`/`description` kann ein reiner String sein (Fallback für alle Sprachen) oder ein mehrsprachiges Objekt `{ "zh": "...", "en": "..." }`; die App interpretiert es anhand der aktuellen locale (Fallback: aktuelle locale → zh → en → erste verfügbare) |
| `tier` | `sandbox` (isoliertes origin-iframe, eingeschränkt) oder `trusted` (Hauptprozess, volle Host-Fähigkeiten; nach der Installation muss der Nutzer in der App auf «Genehmigen» klicken, um TOFU zu autorisieren) |
| `icon` | Sollte mit dem `icon` aus der `manifest.json` der Extension **übereinstimmen**: inline-SVG-Text (füge den Inhalt der `.svg`-Datei der Extension ein) oder Emoji. Installierte Extensions lesen das SVG lokal, der Store rendert es aus dem catalog – beide Seiten müssen übereinstimmen, damit in Store und installierter Liste dasselbe Icon angezeigt wird |
| `downloadUrl` | Direkter Link zum Release-asset deines Repositorys; Host muss `github.com` sein |

Reiche den PR ein und beschreibe die Extension-Funktionalität, die beanspruchten Berechtigungen und warum dieser tier.

---

## Maintainer-Review-Checkliste

Vor dem Mergen des PR jeden Punkt bestätigen:

- [ ] **id eindeutig**: Keine doppelte `id` in `catalog.json` und kein Konflikt mit offiziellen Extensions (`folyn-rich-text` / `folyn-dbml` / `folyn-file-viewer`)
- [ ] **id gültig**: Die `id` in `manifest.json` stimmt mit der `id` des catalog-Eintrags überein; kebab-case, kein `.` / `/` / `\` (`is_valid_extension_id`)
- [ ] **downloadUrl**: Host ist `github.com`; Tag/asset-Name stimmt mit der `version` des Eintrags überein; `curl -sIL` liefert 200 + `content-type: application/zip`
- [ ] **manifest gültig**: `manifest.json` in der zip-Wurzel; `id`/`name`/`version`/`tier`/`main` vollständig; `validate_manifest` durchgelaufen
- [ ] **tier angemessen**: Wenn `sandbox` möglich, nicht `trusted` verwenden. `trusted` hat volle Hauptprozess-Fähigkeiten (vault lesen/schreiben, Tauri-Befehle aufrufen, auf gesamten React-state zugreifen) – nur für Extensions freigeben, die zwingend tiefe Integration benötigen
- [ ] **Berechtigungen minimal**: `permissions.fs`/`http`/`vault` usw. nach Bedarf deklarieren; origin-allowlist enthält keine Wildcards; `contributes`-Deklaration passt zur Funktionalität
- [ ] **zip sauber**: Kein `src/`, `*.ts`, `package*.json`, `node_modules`; keine Symlinks; Größe innerhalb der Grenzen (Einzeldatei ≤50 MB / Gesamt ≤100 MB / ≤1000 Einträge)
- [ ] **icon mit manifest konsistent**: Das `icon` im catalog sollte mit dem `icon` aus der `manifest.json` der Extension übereinstimmen (gleiches inline-SVG oder gleiches Emoji), sonst zeigen Store und installierte Liste unterschiedliche Icons
- [ ] **mehrsprachig**: `name`/`description` mindestens in Sprachen bereitstellen, die Nutzer wahrscheinlich verwenden; ein reiner String als Fallback für alle Sprachen ist ebenfalls möglich
- [ ] **Signatur** (optional): Falls `signature` + `publisherPublicKey` vorhanden, Signatur auf Übereinstimmung prüfen (`verify_extension_signature`); bei Fehlen greift die SHA-256-integrity als Fallback, im MVP nicht erzwungen
- [ ] **lokale Testinstallation**: In der App unter «Installiert» mit «Aus .zip installieren» das zip auswählen und einmal durchlaufen lassen; bestätigen, dass es installiert, aktiviert wird und die Contribution-Punkte korrekt registriert werden

Nach erfolgreichem Review den PR mergen. Nutzer sehen die neue Extension beim nächsten Öffnen des Stores (oder nach Klick auf «Aktualisieren»).

---

## Veröffentlichte Extension aktualisieren

Eine neue Version veröffentlichen = in deinem Repository einen neuen Tag `<id>-<new-version>` setzen + neues zip-asset hochladen, dann einen PR an dieses Repository einreichen, um `version` und `downloadUrl` des jeweiligen Eintrags in `catalog.json` zu aktualisieren. Folyn MVP macht keinen Versionsabgleich mit Update-Hinweisen – bereits installierte Nutzer müssen in der «Installiert»-Seite deinstallieren und neu installieren oder einfach darüber installieren (`install_extension_zip` ist wipe + new, Überschreiben reicht).

## Entfernen aus dem Store

Den Eintrag aus `catalog.json` löschen genügt. Bereits installierte Extensions sind nicht betroffen (lokales `extensions.json` und `~/.folyn/extensions/<id>/` bleiben erhalten; Nutzer können manuell deinstallieren).
