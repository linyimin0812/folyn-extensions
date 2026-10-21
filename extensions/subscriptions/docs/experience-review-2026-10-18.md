# 订阅插件体验审查 · 2026-10-18

以下为修复前审查；所列10项已在0.3.5落实，结果见[逐项验收](experience-optimization-acceptance.md)。

基于0.3.4生产包、源码与内存Vault预览。目标是收尾流程和状态一致性，保留现有紧凑三栏、稳定居中弹窗、自定义下拉框和已确认的收展交互。本轮未修改产品代码或重新打包。

P1指影响数据保存或使核心操作持续失效；P2指可恢复的交互错误；P3为设计优化。以下明确区分确认问题与建议。

| 优先级 / 类型 | 位置与当前行为 | 建议调整 | 用户收益 |
| --- | --- | --- | --- |
| P1 · 确认问题 | 设置/重新识别调用的persist捕获写入异常后仍resolve，保存调用继续关闭弹窗；新值仅保留在内存，外层虽有错误横幅，用户编辑上下文已退出。[service.ts:92](/Users/yiminlin/project/folyn-extensions/extensions/subscriptions/src/service.ts:92)、[settings.tsx:27](/Users/yiminlin/project/folyn-extensions/extensions/subscriptions/src/settings.tsx:27)、[add-source.tsx:98](/Users/yiminlin/project/folyn-extensions/extensions/subscriptions/src/add-source.tsx:98) | 提交保存要向上返回错误，写入成功再关闭；失败在原弹窗保留输入并可重试。后台阅读状态等写入与显式提交应有明确的错误契约。 | 避免设置看似已应用，重启后丢失。 |
| P1 · 确认问题 | 历史游标为null时，refresh同步提前返回，finally先删除任务，随后tasks.set又写回已完成Promise，导致同来源后续普通刷新直接复用旧任务、不再请求。[service.ts:322](/Users/yiminlin/project/folyn-extensions/extensions/subscriptions/src/service.ts:322)、[service.ts:370](/Users/yiminlin/project/folyn-extensions/extensions/subscriptions/src/service.ts:370) | 统一注册任务后再执行/清理，覆盖同步结束分支。另将来源header的refresh(source,true)改普通刷新，历史仅由“加载更多历史文章”触发。[workspace.tsx:268](/Users/yiminlin/project/folyn-extensions/extensions/subscriptions/src/workspace.tsx:268) | 历史加载到底之后仍能获得最新文章，按钮含义与动作一致。 |
| P2 · 已确认行为 / 流程建议 | 添加先保存来源与索引，然后等待预览文章所有图片缓存；这时“取消”只关弹窗，已添加的来源继续存在；后续缓存写入失败还会使主流程报错。[service.ts:261](/Users/yiminlin/project/folyn-extensions/extensions/subscriptions/src/service.ts:261)、[add-source.tsx:34](/Users/yiminlin/project/folyn-extensions/extensions/subscriptions/src/add-source.tsx:34) | 来源提交成功即完成添加，图片后台继续；若保留等待阶段，提交后的关闭应叫“后台继续”，图片失败作为部分完成处理。 | 图多或慢网站不会拖住添加；取消的后果可预测。 |
| P2 · 确认问题 | 来源设置只将没有cache对象的文章计入待下载，缺图文章不计入，可能显示“已全部缓存”。设置仍描述旧的24张/4MB/16MB限制。[source-actions.tsx:26](/Users/yiminlin/project/folyn-extensions/extensions/subscriptions/src/source-actions.tsx:26)、[settings.tsx:182](/Users/yiminlin/project/folyn-extensions/extensions/subscriptions/src/settings.tsx:182) | 统一未缓存、缓存中、部分离线、完整离线状态；区分“下载正文”和“补全图片”，后者复用retryImages。更新说明为单张8MB、每篇图片64MB，无24张数量限制。 | 列表、阅读区与设置对离线程度给出相同答案。 |
| P2 · 确认问题 | 保存弹窗“重试获取缺失图片”调用loadBody(article,true)强制重抓正文，没有本地busy反馈，完成后要求关闭重开核对。[save.tsx:113](/Users/yiminlin/project/folyn-extensions/extensions/subscriptions/src/save.tsx:113) | 只重试缺图；按钮与保存动作互斥，弹窗内显示进度，原位更新缺图数与可保存状态。 | 少下载一次正文，不丢当前输入与操作位置。 |
| P2 · 浏览器确认 | 搜索没有结果时主动作是“添加来源”；在未读视图显示“当前没有未读文章”，但左栏仍有8篇未读；点“查看全部”不清空查询，仍为0篇。[workspace.tsx:342](/Users/yiminlin/project/folyn-extensions/extensions/subscriptions/src/workspace.tsx:342) | 搜索条件优先解释空态：“没有匹配当前搜索的文章”，主动作“清空搜索”；无任何来源时才引导添加。 | 一步回到可读列表，不误判订阅没有更新。 |
| P2 · 代码确认，待长列表实测 | 列表初始渲染40篇，方向键按完整数组选择下一篇；第40篇向下可选到未渲染的第41篇，焦点仍留第40篇。[workspace.tsx:303](/Users/yiminlin/project/folyn-extensions/extensions/subscriptions/src/workspace.tsx:303) | 接近边界时扩容下一批，再聚焦并滚动到目标；保持选中、阅读器和键盘焦点一致。 | 连续阅读长列表不会重复或失去位置。 |
| P2 · 浏览器确认 | 图片大图支持Esc关闭，但无可见关闭/缩放/复位控件，无焦点隔离，Tab能离开遮罩；正文图也无键盘打开入口。[reader.tsx:237](/Users/yiminlin/project/folyn-extensions/extensions/subscriptions/src/reader.tsx:237)、[reader.tsx:420](/Users/yiminlin/project/folyn-extensions/extensions/subscriptions/src/reader.tsx:420) | 沿用原生dialog并恢复触发位置焦点；增加紧凑浮动工具条“缩小 / 100% / 放大 / 关闭”，支持键盘。 | 技术长图操作更明确，键盘用户也能完整使用。 |
| P3 · 浏览器确认行为 / 设计建议 | 点击分组名称只折叠，右侧10px小数字才进入分组，数字实际表示来源数。[workspace.tsx:249](/Users/yiminlin/project/folyn-extensions/extensions/subscriptions/src/workspace.tsx:249) | 箭头负责折叠，名称负责查看文章；数字只作为明确的辅助计数。 | 导航入口更好发现，减少误折叠。 |
| P3 · 样式一致性建议 | 刷新入口使用向下的fetch图标，来源/分组菜单使用文字“⋯”，阅读区更多则为SVG竖三点。[workspace.tsx:235](/Users/yiminlin/project/folyn-extensions/extensions/subscriptions/src/workspace.tsx:235)、[workspace.tsx:255](/Users/yiminlin/project/folyn-extensions/extensions/subscriptions/src/workspace.tsx:255) | 刷新统一回环箭头，下载才使用向下箭头；更多入口统一SVG图标、热区和悬停反馈，沿用现有颜色与密度。 | 图标含义可预测，界面更完整精致。 |

建议实施顺序：先处理两个P1及刷新语义；然后统一缓存修复与添加完成状态；再处理搜索恢复、长列表键盘和大图；最后统一分组导航与图标。无需再换一套页面皮肤或增加新的内容获取能力。

验证记录：1280×800与当前766×954窗口检查主工作区；在生产bundle的内存Vault中实测搜索空态、未读切换、分组名称与数字的不同动作、设置缓存说明、图片查看及Tab/Esc。图片查看Esc有效，Tab不能保持在查看层内；通用原生弹窗和自定义下拉已有键盘处理，未发现支持整体重写的证据。长列表第40篇边界目前仅由代码确认，没有冒充浏览器实测。未进行新的公网抓取、真实AI调用或原生安装验收。

截图：[搜索空态](audit-search-empty.jpg)、[缓存设置说明](audit-cache-settings.jpg)、[图片查看](audit-image-viewer.jpg)。

最小执行验证：`pnpm exec vitest run test/flow-audit-diagnostic.test.ts --reporter=verbose`，2项诊断通过，临时测试已删除。写入故障注入后updateSource仍正常返回，内存来源名已变、重新加载磁盘状态仍旧值。历史耗尽后同service普通刷新为0请求，切换Vault仍为0请求；新建service与独立正常对照均为1请求、从2篇导入到3篇。故第二项不是单次按钮语义问题，会持续阻断后续刷新。原始记录见[experience-review-evidence.json](experience-review-evidence.json)。

评审结论：两个P1建议作为下一版本发布前的修复项；其余按用户收益分批完成。未重新运行全套回归，因为本轮未修改产品代码。
