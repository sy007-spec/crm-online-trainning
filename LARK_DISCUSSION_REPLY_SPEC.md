# 课堂留言飞书卡片

2026-11-07。独立站与托管站共用教学核心实现。

留言持久化后立即排队通知，不等待 AI；AI 结束后更新同一张卡片。使用配置的收件人及本课程绑定群管理员，持久队列重试，发送 UUID 幂等；重启继续发送。未配置飞书时在后台显示状态，不影响留言保存。

卡片使用飞书 JSON 2.0 表单，多行 Markdown 输入、点击预览、明确发布。长回复分成四个最多 1000 字的连续输入段，合计遵循课堂 4000 字限制，不静默裁剪 AI 长答案。原 AI 内容保留，人工修订以讲师回复发布并可继续更新，学员不再看到被替代的 AI 答案。预览不发布到课堂。

签名/长连接可信事件、消息 ID 与服务器卡片绑定、课程范围管理员、有效订阅、问题状态/正文指纹、编辑版本和回调幂等均需核验。群所有者只能处理自己绑定课程。人工回复审计留存旧文。原文编辑、删除、私密化使旧操作失效；私密及仅讲师讨论只发送无正文通知，不把正文/AI 内容广播给群，不从卡片越权回复。无 AI 时人工链路不调用模型。

回调立即返回卡片/提示，不在回调内等待模型或外部网络。Markdown 预览使用飞书渲染，过滤 @ 标签和图片外链；正式课堂回复仍沿用网站安全 Markdown 渲染。飞书客户端支持范围以官方卡片组件为准，不声称支持任意 HTML。

参考：官方 [卡片组件](https://open.feishu.cn/document/feishu-cards/card-json-v2-components/component-json-v2-overview)、[输入框](https://open.feishu.cn/document/feishu-cards/card-json-v2-components/interactive-components/input)、[交互配置](https://open.feishu.cn/document/feishu-cards/configuring-card-interactions)。

测试包括新留言通知、AI 更新、无模型人工回复、预览不发布、重复/并发/跨课程/旧卡拒绝、私密正文不外发、持久重试、签名 HTTP 与长连接表单透传，以及网站 Markdown 展示。发布使用统一 ops.py，分别备份并更新两站。
