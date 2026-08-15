# NOTICE

本仓库（MDT）包含以下第三方内容，特此声明其来源与许可：

## DeepSeek Harness（官方预设与注入内容）

`agent-presets-repro/presets/shipped/`（code / cordis / minimal / standard 官方预设）复制自 DeepSeek Harness 官方仓库：

  https://github.com/deepseek-ai/deepseek-harness

DeepSeek Harness 以 MIT License 分发：

  Copyright (c) 2026 DeepSeek

各实验目录内 `dsh-session-*.zip` 会话记录的 system 提示词包含 DeepSeek Harness 自动注入的内容（如 AGENTS.md 工作区说明、工具使用说明等），属 DeepSeek Harness 的注入内容，许可同上。

## dsh-anchored-standard（实验预设与插件）

`agent-presets-repro/presets/custom/` 各预设的 `agent.cordis.yml` 定义与 `.mjs` 插件（tool-bootstrap / custom-bash / zero-tool-bootstrap / anchor-turn / contract-section / compaction-epoch / dev-tool-search / instruction-hint / skill-search 等）源自：

  https://github.com/xiaobright/dsh-anchored-standard
  （lscatfish fork：https://github.com/lscatfish/dsh-anchored-standard）

dsh-anchored-standard 以 MIT License 分发：

  Copyright (c) 2026 xiaobright
  Portions Copyright (c) 2026 DeepSeek

该仓库自身亦包含 DeepSeek Harness Standard 预设的改编副本（见其 NOTICE）。

## 模型输出

实验内容由 DeepSeek 模型（deepseek-v4-pro，deepseek-official API）生成，其使用受 DeepSeek 服务条款约束；本仓库对模型输出按上述各来源的许可处理。

## 本仓库原创内容

11 个实验项目代码、会话记录整理、分析文档、预设包的组装，以 MIT License 分发（见 LICENSE）：

  Copyright (c) 2026 SC L

DeepSeek 与 DeepSeek Harness 均为其各自所有者的名称。本仓库为社区实验项目，与 DeepSeek 及 DeepSeek Harness 官方**无关联、未获其背书**；仓库内所有分析结论仅代表对实验数据的记录与归纳，不代表作者观点，不保证可复现（详见 README“实验条件与结论声明”）。
