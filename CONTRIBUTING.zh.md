[English](CONTRIBUTING.md) | [简体中文](CONTRIBUTING.zh.md) | [日本語](CONTRIBUTING.ja.md) | [Français](CONTRIBUTING.fr.md) | [Deutsch](CONTRIBUTING.de.md) | [Español](CONTRIBUTING.es.md)

# 贡献扩展到 Folyn 商店

本仓库是 [Folyn](https://github.com/linyimin0812/folyn) 扩展商店的**中央目录**。根目录的 `catalog.json` 列出所有可安装的扩展；每个扩展的 zip 包托管在**发布者自己的 GitHub 仓库**的 Releases 上，Folyn 应用从本目录拉取列表、从发布者仓库下载安装。

任何第三方都能贡献扩展：把你的扩展打成 zip、发到你自己的 GitHub Release、向本仓库提 PR 在 `catalog.json` 加一条。维护者审核 manifest / 权限 / tier 后合并，所有用户即在商店可见。

---

## 发布流程（第三方）

### 1. 构建扩展

按 [Folyn 扩展开发文档](https://github.com/linyimin0812/folyn/blob/main/docs/extension-store.md) 开发扩展，产出 `dist/` 目录。`dist/` 的**根**必须含 `manifest.json`（Folyn 安装时从 zip 根读 manifest）。

### 2. 打 zip

把 `dist/` 的**内容**（不是 `dist` 文件夹本身）打成 zip，保证 `manifest.json` 在 zip 根：

```sh
cd path/to/your-extension/dist
zip -r -X <id>-<version>.zip . -x "*.DS_Store"
```

验证：
```sh
unzip -l <id>-<version>.zip | head   # manifest.json 必须在根，无目录前缀
```

**zip 内容约束**（Folyn 安装时由 `extract_zip_filtered` 强制，违规直接拒绝安装）：
- ❌ 源码：`src/`、`*.ts`
- ❌ 配置/锁文件：`package.json`、`package-lock.json`、`pnpm-lock.yaml`、`tsconfig.json` 等
- ❌ `node_modules/`
- ❌ 符号链接、绝对路径、`..` 路径（zip-slip 防护）
- ⚠️ 单文件 > 50 MB、总计 > 100 MB、> 1000 条目会被拒

### 3. 发 GitHub Release

在你的扩展仓库创建 tag `<id>-<version>`（如 `my-ext-0.2.0`），上传 zip 作为 Release asset：

```sh
gh release create <id>-<version> <id>-<version>.zip \
  --repo <your-github-username>/<your-extension-repo> \
  --title "<id> <version>"
```

记录 asset 的下载直链，形如：
```
https://github.com/<your-github-username>/<your-extension-repo>/releases/download/<id>-<version>/<id>-<version>.zip
```

> ⚠️ 下载 URL 的 host **必须是 `github.com`**。Folyn 的 `install_extension_from_url` 命令只允许 `github.com`（SSRF 防护），其它 host 会被拒。Release asset 会 302 跳转到 `objects.githubusercontent.com`，已由下载器自动跟随，无需处理。

### 4. 提 PR 到本目录

Fork 本仓库，编辑 `catalog.json`，在 `extensions` 数组末尾加一条：

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

> `name`/`description` 也可写成纯字符串（如 `"name": "DBML"`），此时所有语言都显示该字符串。多语言对象则按用户当前语言渲染，缺失时回退 zh → en → 第一个可用。`icon` 应与扩展 `manifest.json` 的 `icon` 一致——建议直接把扩展的 `.svg` 图标文件内容粘进来（或用同一 emoji）。

字段说明：

| 字段 | 说明 |
|---|---|
| `id` | 必须与 zip 内 `manifest.json` 的 `id` 一致；kebab-case；全局唯一（查重见下） |
| `name` / `version` / `description` / `author` | 展示用；`version` 与 Release tag 一致。`name`/`description` 可以是纯字符串（所有语言回退）或 `{ "zh": "...", "en": "..." }` 多语言对象，应用按当前 locale 解析（回退：当前 locale → zh → en → 第一个可用） |
| `tier` | `sandbox`（独立 origin iframe，受限）或 `trusted`（主进程，全宿主能力，安装后需用户在应用内点「批准」授权 TOFU） |
| `icon` | 应与扩展 `manifest.json` 的 `icon` **一致**：inline SVG 文本（把扩展的 `.svg` 文件内容粘进来）或 emoji。已装扩展会从本地读 SVG，商店从 catalog 渲染——两边一致才能在商店和已装列表显示同一图标 |
| `downloadUrl` | 你仓库的 Release asset 直链，host 必须 `github.com` |

提交 PR，描述扩展功能、声明的权限、为什么这个 tier。

---

## 维护者审核清单

PR 合并前逐项确认：

- [ ] **id 唯一**：`catalog.json` 内无重复 `id`，且不与官方扩展（`folyn-rich-text` / `folyn-dbml` / `folyn-file-viewer`）冲突
- [ ] **id 合法**：`manifest.json` 的 `id` 与 catalog 条目 `id` 一致；kebab-case，无 `.` / `/` / `\`（`is_valid_extension_id`）
- [ ] **downloadUrl**：host 是 `github.com`；tag/asset 名与条目 `version` 一致；`curl -sIL` 返回 200 + `content-type: application/zip`
- [ ] **manifest 合法**：`manifest.json` 在 zip 根；`id`/`name`/`version`/`tier`/`main` 齐全；`validate_manifest` 通过
- [ ] **tier 合理**：能用 `sandbox` 就别 `trusted`。`trusted` 拥有主进程全能力（读写 vault、调 Tauri 命令、访问所有 React state）——仅对确需深度集成的扩展放行
- [ ] **权限最小**：`permissions.fs`/`http`/`vault` 等按需声明，origin allowlist 不含通配；`contributes` 声明与功能匹配
- [ ] **zip 干净**：无 `src/`、`*.ts`、`package*.json`、`node_modules`；无符号链接；体积在限制内（单文件 ≤50 MB / 总量 ≤100 MB / ≤1000 条目）
- [ ] **icon 与 manifest 一致**：catalog 的 `icon` 应与扩展 `manifest.json` 的 `icon` 同源（同一 inline SVG 或同一 emoji），否则商店与已装列表显示不同图标
- [ ] **多语言**：`name`/`description` 至少提供用户可能用到的语言；纯字符串作为所有语言回退也可
- [ ] **签名**（可选）：若带 `signature` + `publisherPublicKey`，验证签名匹配（`verify_extension_signature`）；缺失则靠 SHA-256 integrity 兜底，MVP 不强制
- [ ] **本地试装**：在应用「已安装」页用「从 .zip 安装」选该 zip 跑一遍，确认能装、能激活、贡献点正常注册

审核通过后合并 PR。用户下次打开商店（或点「刷新」）即看到新扩展。

---

## 更新已发布的扩展

发新版本 = 在你仓库发新 tag `<id>-<new-version>` + 上传新 zip asset，再向本仓库提 PR 更新 `catalog.json` 里该条的 `version` 与 `downloadUrl`。Folyn MVP 不做版本比对更新提示——已装用户需在「已安装」页卸载后重装，或直接覆盖安装（`install_extension_zip` 是 wipe + new，覆盖即可）。

## 下架

从 `catalog.json` 删条目即可。已安装的扩展不受影响（本地 `extensions.json` 与 `~/.folyn/extensions/<id>/` 仍保留，用户可手动卸载）。
