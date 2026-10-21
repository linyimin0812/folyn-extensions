# 0.3.5 体验优化逐项验收

当前分组标题整行收起/展开，下面直接显示订阅源；下文第9项保留0.3.5的历史验收，当前行为见[验收记录](acceptance.md)中的0.3.7条目。

2026-10-18。依据体验审查的10项要求实施；保留紧凑三栏、既有阅读和收展行为。本轮生产改动仅在插件，不新增权限或宿主接口。

| 要求 | 完成情况与证据 |
| --- | --- |
| 1. P1：显式保存失败保留弹窗和输入、向上报错并回滚 | 已验证。test/flow-commit.test.ts；test/flow-dialogs.test.ts；browser source settings simulated write failure and successful retry |
| 2. P1：历史到底不残留任务，header刷新最新而非加载历史 | 已验证。test/flow-commit.test.ts history exhaustion then ordinary refresh；test/workspace-interactions.test.ts source header |
| 3. 添加提交和图片缓存分离、提交关闭语义清晰、取消/切Vault安全 | 已验证。test/flow-commit.test.ts；test/flow-dialogs.test.ts submit guards；browser slow image fixture4500ms per image: import288ms, immediately readable text and0/4 pending |
| 4. 完整/部分/处理中缓存状态一致，旧限制文案更新 | 已验证。test/source-actions-ui.test.ts；test/workspace-interactions.test.ts cache states；test/flow-commit.test.ts interrupted cache reload；settings source inspection8MB/64MB/no count cap |
| 5. 保存弹窗只补缺图、原位进度/结果、保留目录和文件名、保存互斥 | 已验证。test/save-cache-ui.test.ts；browser29/32 ->31/32 preserving Notes andcustomfilename; explicit remote-link choice then saved to Notes/体验优化验收文档.md |
| 6. 搜索空态解释正确、清空搜索恢复当前视图 | 已验证。test/workspace-interactions.test.ts；browser unread no-result -> clear search ->40 visible rows and search focus |
| 7. 长列表第40到41篇选中、焦点、阅读器同步 | 已验证。test/workspace-interactions.test.ts；browser40 rendered rows ->55; active and reader both 连续阅读第41篇 |
| 8. 大图键盘入口、原生模态、Tab循环、关闭焦点、缩放/100%/适应/移动/拖动 | 已验证。test/image-viewer-ui.test.ts；test/translation-stream-ui.test.ts stableimageDOM/focus duringstream；browser Enter/Space, sixTabs allinside,120%,100%,Esc restore,1000x2400 longimage scrollHeight2512 andkeyboard scrollTop976；browser resize390x700 keeps dialog390x700,toolbar reachable,Esc restores image |
| 9. 分组名称导航、箭头折叠、数字辅助信息 | 已验证。test/workspace-interactions.test.ts；browser groupname opens group articlelist withoutcollapsing and reopens collapsedmiddlepane |
| 10. 刷新回环箭头、更多竖三点SVG、统一热区与反馈 | 已验证。production screenshot optimization-workspace.jpg；source inspection existing Icon refresh/more reused and26px+ controls |

最终命令：`pnpm test`（175通过、1项默认跳过公网用例）、`pnpm typecheck`、`pnpm package`均通过。关键回归先复现失败再修复；原有翻译、图片DOM稳定、真实页面捕获、保存、分组、Vault隔离等检查继续通过。

生产包浏览器验收：设置故障注入后保留输入并重试成功；补图29/32→31/32，1个模拟403仍明确失败，勾选保留远程链接后原位保存成功；第40→41篇和分组/搜索恢复通过；慢图4500ms场景添加288ms结束，正文立即可读；图片Tab循环与1000×2400长图、390×700窄窗口通过。人工操作计时仅代表这次模拟夹具，不能泛化为真实网站耗时。

原生验收边界：尝试打开本机 `/Applications/Folyn.app` 时工具超时，随后应用清单仍为未运行；因此本轮没有完成已安装Folyn中的原生安装/重新批准流程。未直接改写扩展注册表或授权记录，未向真实Vault写测试内容。浏览器验收使用实际生产bundle和模拟宿主，不能等同于原生安装验收。

安装物：`folyn-subscriptions.zip`根目录只有manifest.json与index.js，manifest版本0.3.5、main=index.js，ZIP内容与dist一致。精确哈希和机器可读证据见[experience-optimization-evidence.json](experience-optimization-evidence.json)。

截图：[工作区](optimization-workspace.jpg)、[保存失败保留输入](optimization-save-error.jpg)、[补图进度](optimization-save-images-loading.jpg)、[保存成功](optimization-save-success.jpg)、[后台慢图](optimization-add-background.jpg)、[暗黑长图](optimization-image-dark.jpg)、[窄窗口长图](optimization-image-narrow.jpg)。
