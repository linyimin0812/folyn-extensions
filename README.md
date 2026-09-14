# folyn-extensions

[Folyn](https://github.com/linyimin0812/folyn) 扩展商店的中央目录。

本仓库只有一个文件：[`catalog.json`](./catalog.json) ——列出所有可安装的扩展。Folyn 应用从 `https://raw.githubusercontent.com/linyimin0812/folyn-extensions/main/catalog.json` 拉取这个列表，从各扩展发布者自己的 GitHub Releases 下载安装。

## 收录的扩展

| id | 说明 | tier |
|---|---|---|
| `folyn-rich-text` | 富文本编辑器：ProseMirror + HTML 导出 | trusted |
| `folyn-dbml` | DBML 数据库建模：CodeMirror + ER 图预览 | trusted |
| `folyn-file-viewer` | 通用文件查看器（Office/PDF/CAD/归档/媒体），兜底 FileType 扩展 | trusted |

## 贡献扩展

第三方发布扩展到本商店的流程见 [CONTRIBUTING.md](./CONTRIBUTING.md)。

简要：把扩展打成 zip 发到你自己的 GitHub Release → 向本仓库提 PR 在 `catalog.json` 加一条（`downloadUrl` 指向你的 Release）→ 维护者审核 manifest/权限/tier 后合并。
