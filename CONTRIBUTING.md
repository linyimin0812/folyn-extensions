[English](CONTRIBUTING.md) | [简体中文](CONTRIBUTING.zh.md) | [日本語](CONTRIBUTING.ja.md) | [Français](CONTRIBUTING.fr.md) | [Deutsch](CONTRIBUTING.de.md) | [Español](CONTRIBUTING.es.md)

# Contributing extensions to the Folyn store

This repository is the **central catalog** for the [Folyn](https://github.com/linyimin0812/folyn) extension store. The `catalog.json` at the repository root lists all installable extensions; each extension's zip is hosted on the **publisher's own GitHub repository** Releases. The Folyn app pulls the list from this catalog and downloads each extension from the publisher's repository for installation.

Any third party can contribute an extension: package your extension as a zip, attach it to your own GitHub Release, and open a PR against this repository adding an entry to `catalog.json`. Maintainers review the manifest / permissions / tier and merge it, after which the extension becomes visible in the store to all users.

---

## Publishing process (third party)

### 1. Build the extension

Develop your extension following the [Folyn extension development docs](https://github.com/linyimin0812/folyn/blob/main/docs/extension-store.md), producing a `dist/` directory. The **root** of `dist/` must contain `manifest.json` (Folyn reads the manifest from the zip root during installation).

### 2. Zip it up

Zip the **contents** of `dist/` (not the `dist` folder itself) so that `manifest.json` ends up at the zip root:

```sh
cd path/to/your-extension/dist
zip -r -X <id>-<version>.zip . -x "*.DS_Store" "*.map"
```

Verify:
```sh
unzip -l <id>-<version>.zip | head   # manifest.json must be at the root, with no directory prefix
```

**Zip content constraints** (enforced at install time by Folyn's `extract_zip_filtered`; violations are rejected outright):
- ❌ Source code: `src/`, `*.ts`
- ❌ Source maps: `*.map` (vite/webpack emit them; they leak source paths and are hard-rejected)
- ❌ Config/lockfiles: `package.json`, `package-lock.json`, `pnpm-lock.yaml`, `tsconfig.json`, etc.
- ❌ `node_modules/`
- ❌ Symlinks, absolute paths, and `..` paths (zip-slip protection)
- ⚠️ A single file > 50 MB, a total > 100 MB, or more than 1000 entries will be rejected

### 3. Create a GitHub Release

Create a tag `<id>-<version>` (e.g. `my-ext-0.2.0`) in your extension repository and upload the zip as a Release asset:

```sh
gh release create <id>-<version> <id>-<version>.zip \
  --repo <your-github-username>/<your-extension-repo> \
  --title "<id> <version>"
```

Record the asset's direct download URL, which will look like:
```
https://github.com/<your-github-username>/<your-extension-repo>/releases/download/<id>-<version>/<id>-<version>.zip
```

> ⚠️ The download URL's host **must be `github.com`**. Folyn's `install_extension_from_url` command only allows `github.com` (SSRF protection); any other host is rejected. Release assets 302-redirect to `objects.githubusercontent.com`, which the downloader follows automatically — no handling needed on your side.

### 4. Open a PR to this catalog

Fork this repository, edit `catalog.json`, and append an entry to the `extensions` array:

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

> `name`/`description` may also be plain strings (e.g. `"name": "DBML"`), in which case that string is shown for all languages. A multilingual object is rendered according to the user's current language, falling back zh → en → the first available. The `icon` should match the extension's `manifest.json` `icon` — the easiest approach is to paste in your extension's `.svg` icon file content directly (or use the same emoji).

Field reference:

| Field | Description |
|---|---|
| `id` | Must match the `id` in the zip's `manifest.json`; kebab-case; globally unique (see deduplication below) |
| `name` / `version` / `description` / `author` | Display fields; `version` must match the Release tag. `name`/`description` may be a plain string (used as fallback for all languages) or a multilingual object `{ "zh": "...", "en": "..." }`, which the app resolves against the current locale (fallback: current locale → zh → en → first available) |
| `tier` | `sandbox` (isolated origin iframe, restricted) or `trusted` (main process, full host capabilities; after install the user must tap "Approve" in-app to grant TOFU authorization) |
| `icon` | Should **match** the extension's `manifest.json` `icon`: inline SVG text (paste your extension's `.svg` file content) or an emoji. Installed extensions read the SVG from local storage, while the store renders it from the catalog — both sides must agree so the store and the installed list show the same icon |
| `downloadUrl` | Direct link to the Release asset in your repository; the host must be `github.com` |

Submit the PR, describing the extension's functionality, the declared permissions, and the rationale for the chosen tier.

---

## Maintainer review checklist

Confirm each item before merging the PR:

- [ ] **id is unique**: no duplicate `id` in `catalog.json`, and no conflict with the official extensions (`folyn-rich-text` / `folyn-dbml` / `folyn-file-viewer`)
- [ ] **id is valid**: the `manifest.json` `id` matches the catalog entry's `id`; kebab-case, with no `.` / `/` / `\` (`is_valid_extension_id`)
- [ ] **downloadUrl**: host is `github.com`; the tag/asset name matches the entry's `version`; `curl -sIL` returns 200 + `content-type: application/zip`
- [ ] **manifest is valid**: `manifest.json` is at the zip root; `id`/`name`/`version`/`tier`/`main` are all present; `validate_manifest` passes
- [ ] **tier is reasonable**: prefer `sandbox` over `trusted` where possible. `trusted` grants full main-process capabilities (read/write the vault, invoke Tauri commands, access all React state) — reserve it for extensions that genuinely require deep integration
- [ ] **least privilege**: `permissions.fs`/`http`/`vault` etc. are declared as needed; the origin allowlist contains no wildcards; `contributes` declarations match the functionality
- [ ] **zip is clean**: no `src/`, `*.ts`, `package*.json`, or `node_modules`; no symlinks; size within limits (single file ≤ 50 MB / total ≤ 100 MB / ≤ 1000 entries)
- [ ] **icon matches the manifest**: the catalog's `icon` should share the same source as the extension's `manifest.json` `icon` (the same inline SVG or the same emoji), otherwise the store and the installed list will display different icons
- [ ] **multilingual**: `name`/`description` are provided in at least the languages users are likely to use; a plain string as a fallback for all languages is also acceptable
- [ ] **signature** (optional): if `signature` + `publisherPublicKey` are present, verify the signature matches (`verify_extension_signature`); if absent, fall back to SHA-256 integrity — not enforced in the MVP
- [ ] **local install test**: on the app's "Installed" page, use "Install from .zip" to select the zip and run through it once, confirming it installs, activates, and registers its contribution points correctly

Once the review passes, merge the PR. Users will see the new extension the next time they open the store (or tap "Refresh").

---

## Updating a published extension

Releasing a new version = create a new tag `<id>-<new-version>` in your repository, upload the new zip asset, then open a PR against this repository updating that entry's `version` and `downloadUrl` in `catalog.json`. The Folyn MVP does not do version-comparison update prompts — installed users must either uninstall and reinstall from the "Installed" page, or install over the existing one (`install_extension_zip` is wipe + new, so overwriting is fine).

## Delisting

Simply remove the entry from `catalog.json`. Installed extensions are unaffected (the local `extensions.json` and `~/.folyn/extensions/<id>/` are retained; the user can manually uninstall).
