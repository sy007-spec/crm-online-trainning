# 独立站 DeepSeek 接入

目标：使用用户私有文件提供的密钥，为独立站配置 DeepSeek / deepseek-flash 默认模型；保留已有 Gemini 配置与数据。密钥不进入仓库、命令行参数或日志，导入后使用现有 AES-GCM 模型连接存储。

使用官方 https://api.deepseek.com/v1 接口。课程流程要求有界 JSON 输出，官方 DeepSeek 接入显式关闭默认 thinking，与托管固定接入一致；不改变其他兼容供应商和 Gemini 参数。先通过真实连接和课程问答验证，再启用已验证的连接。配置切换前保存恢复快照，日志仅含非敏感验证结果。

仅部署独立站；托管当前固定 DeepSeek 接入不需要改动。权限文件在用户 LocalAppData 的专用目录，关闭继承，只给当前用户与 SYSTEM 访问；不在 Git 工作区。
