[English](CONTRIBUTING.md) | [简体中文](CONTRIBUTING.zh.md) | [日本語](CONTRIBUTING.ja.md) | [Français](CONTRIBUTING.fr.md) | [Deutsch](CONTRIBUTING.de.md) | [Español](CONTRIBUTING.es.md)

# Contribuer aux extensions du store Folyn

Ce dépôt est le **catalogue central** du store d'extensions [Folyn](https://github.com/linyimin0812/folyn). Le fichier `catalog.json` à la racine du dépôt répertorie toutes les extensions installables ; le zip de chaque extension est hébergé sur les Releases du **propre dépôt GitHub de l'éditeur**. L'application Folyn récupère la liste depuis ce catalogue et télécharge chaque extension depuis le dépôt de l'éditeur pour l'installation.

N'importe quel tiers peut contribuer une extension : empaquetez votre extension sous forme de zip, attachez-la à votre propre Release GitHub, et ouvrez une PR contre ce dépôt en ajoutant une entrée à `catalog.json`. Les mainteneurs examinent le manifest / les permissions / le tier et le fusionnent, après quoi l'extension devient visible dans le store pour tous les utilisateurs.

---

## Processus de publication (tiers)

### 1. Construire l'extension

Développez votre extension en suivant la [documentation de développement d'extensions Folyn](https://github.com/linyimin0812/folyn/blob/main/docs/extension-store.md), produisant un répertoire `dist/`. La **racine** de `dist/` doit contenir `manifest.json` (Folyn lit le manifest depuis la racine du zip lors de l'installation).

### 2. Compresser

Compressez le **contenu** de `dist/` (pas le dossier `dist` lui-même) de sorte que `manifest.json` se retrouve à la racine du zip :

```sh
cd path/to/your-extension/dist
zip -r -X <id>-<version>.zip . -x "*.DS_Store"
```

Vérifiez :
```sh
unzip -l <id>-<version>.zip | head   # manifest.json must be at the root, with no directory prefix
```

**Contraintes sur le contenu du zip** (appliquées lors de l'installation par `extract_zip_filtered` de Folyn ; les violations sont purement et simplement rejetées) :
- ❌ Code source : `src/`, `*.ts`
- ❌ Fichiers de configuration/lockfiles : `package.json`, `package-lock.json`, `pnpm-lock.yaml`, `tsconfig.json`, etc.
- ❌ `node_modules/`
- ❌ Liens symboliques, chemins absolus et chemins `..` (protection zip-slip)
- ⚠️ Un seul fichier > 50 Mo, un total > 100 Mo, ou plus de 1000 entrées seront rejetés

### 3. Créer une Release GitHub

Créez un tag `<id>-<version>` (par ex. `my-ext-0.2.0`) dans votre dépôt d'extension et téléversez le zip en tant qu'asset de Release :

```sh
gh release create <id>-<version> <id>-<version>.zip \
  --repo <your-github-username>/<your-extension-repo> \
  --title "<id> <version>"
```

Notez l'URL de téléchargement direct de l'asset, qui ressemblera à :
```
https://github.com/<your-github-username>/<your-extension-repo>/releases/download/<id>-<version>/<id>-<version>.zip
```

> ⚠️ L'hôte de l'URL de téléchargement **doit être `github.com`**. La commande `install_extension_from_url` de Folyn n'autorise que `github.com` (protection SSRF) ; tout autre hôte est rejeté. Les assets de Release redirigent en 302 vers `objects.githubusercontent.com`, que le téléchargeur suit automatiquement — aucune manipulation n'est nécessaire de votre côté.

### 4. Ouvrir une PR vers ce catalogue

Faites un fork de ce dépôt, éditez `catalog.json`, et ajoutez une entrée au tableau `extensions` :

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

> `name`/`description` peuvent aussi être de simples chaînes de caractères (par ex. `"name": "DBML"`), auquel cas cette chaîne est affichée pour toutes les langues. Un objet multilingue est rendu selon la langue actuelle de l'utilisateur, avec repli zh → en → la première disponible. L'`icon` devrait correspondre à l'`icon` du `manifest.json` de l'extension — l'approche la plus simple consiste à coller directement le contenu du fichier d'icône `.svg` de votre extension (ou à utiliser le même emoji).

Référence des champs :

| Champ | Description |
|---|---|
| `id` | Doit correspondre à l'`id` dans le `manifest.json` du zip ; kebab-case ; globalement unique (voir la déduplication ci-dessous) |
| `name` / `version` / `description` / `author` | Champs d'affichage ; `version` doit correspondre au tag de la Release. `name`/`description` peuvent être une simple chaîne (utilisée comme repli pour toutes les langues) ou un objet multilingue `{ "zh": "...", "en": "..." }`, que l'application résout selon la locale actuelle (repli : locale actuelle → zh → en → première disponible) |
| `tier` | `sandbox` (iframe à origin isolée, restreint) ou `trusted` (processus principal, capacités complètes de l'hôte ; après l'installation, l'utilisateur doit appuyer sur « Approve » dans l'application pour accorder l'autorisation TOFU) |
| `icon` | Doit **correspondre** à l'`icon` du `manifest.json` de l'extension : texte SVG en ligne (collez le contenu du fichier `.svg` de votre extension) ou un emoji. Les extensions installées lisent le SVG depuis le stockage local, tandis que le store le rend depuis le catalogue — les deux côtés doivent concorder pour que le store et la liste des extensions installées affichent la même icône |
| `downloadUrl` | Lien direct vers l'asset de Release dans votre dépôt ; l'hôte doit être `github.com` |

Soumettez la PR, en décrivant la fonctionnalité de l'extension, les permissions déclarées, et la justification du tier choisi.

---

## Checklist de revue par le mainteneur

Confirmez chaque élément avant de fusionner la PR :

- [ ] **id est unique** : pas de `id` en double dans `catalog.json`, et pas de conflit avec les extensions officielles (`folyn-rich-text` / `folyn-dbml` / `folyn-file-viewer`)
- [ ] **id est valide** : l'`id` du `manifest.json` correspond à l'`id` de l'entrée du catalogue ; kebab-case, sans `.` / `/` / `\` (`is_valid_extension_id`)
- [ ] **downloadUrl** : l'hôte est `github.com` ; le nom du tag/asset correspond au `version` de l'entrée ; `curl -sIL` renvoie 200 + `content-type: application/zip`
- [ ] **manifest est valide** : `manifest.json` est à la racine du zip ; `id`/`name`/`version`/`tier`/`main` sont tous présents ; `validate_manifest` réussit
- [ ] **tier est raisonnable** : privilégiez `sandbox` plutôt que `trusted` quand c'est possible. `trusted` accorde toutes les capacités du processus principal (lire/écrire le vault, invoquer des commandes Tauri, accéder à tout l'état React) — réservez-le aux extensions qui nécessitent véritablement une intégration approfondie
- [ ] **moindre privilège** : `permissions.fs`/`http`/`vault` etc. sont déclarées au besoin ; l'origin allowlist ne contient aucun caractère générique ; les déclarations `contributes` correspondent à la fonctionnalité
- [ ] **zip est propre** : pas de `src/`, `*.ts`, `package*.json`, ni `node_modules` ; pas de liens symboliques ; taille dans les limites (fichier unique ≤ 50 Mo / total ≤ 100 Mo / ≤ 1000 entrées)
- [ ] **l'icône correspond au manifest** : l'`icon` du catalogue devrait partager la même source que l'`icon` du `manifest.json` de l'extension (le même SVG en ligne ou le même emoji), sinon le store et la liste des extensions installées afficheront des icônes différentes
- [ ] **multilingue** : `name`/`description` sont fournis dans au moins les langues que les utilisateurs sont susceptibles d'utiliser ; une simple chaîne comme repli pour toutes les langues est également acceptable
- [ ] **signature** (facultatif) : si `signature` + `publisherPublicKey` sont présents, vérifiez que la signature correspond (`verify_extension_signature`) ; si absents, repli sur l'intégrité SHA-256 — non appliqué dans le MVP
- [ ] **test d'installation locale** : sur la page « Installed » de l'application, utilisez « Install from .zip » pour sélectionner le zip et le parcourir une fois, en confirmant qu'il s'installe, s'active et enregistre correctement ses points de contribution

Une fois la revue passée, fusionnez la PR. Les utilisateurs verront la nouvelle extension la prochaine fois qu'ils ouvriront le store (ou qu'ils appuieront sur « Refresh »).

---

## Mettre à jour une extension publiée

Publier une nouvelle version = créer un nouveau tag `<id>-<new-version>` dans votre dépôt, téléverser le nouvel asset zip, puis ouvrir une PR contre ce dépôt en mettant à jour le `version` et le `downloadUrl` de cette entrée dans `catalog.json`. Le MVP de Folyn ne fait pas d'invites de mise à jour par comparaison de versions — les utilisateurs installés doivent soit désinstaller et réinstaller depuis la page « Installed », soit installer par-dessus l'existante (`install_extension_zip` fait un effacement + nouveau, donc l'écrasement ne pose aucun problème).

## Retirer du catalogue (Delisting)

Retirez simplement l'entrée de `catalog.json`. Les extensions installées ne sont pas affectées (le `extensions.json` local et `~/.folyn/extensions/<id>/` sont conservés ; l'utilisateur peut les désinstaller manuellement).
