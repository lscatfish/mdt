# 会话开头核对报告

由 `tools/extract_sessions.py` 从各实验目录的 `dsh-session-*.zip` 自动生成。
每个实验子目录包含 `metadata.json`、`system-prompt.txt`、`session-prefix.jsonl`（开头 60 行原文）。

| 实验目录 | 创建时预设 | 会话内选中预设 | 沙箱 / 批准 | 交给 DeepSeek 的 system 首行 |
| --- | --- | --- | --- | --- |
| B+template | `standard-we-contract` | `zero-anchored-standard-b` | `workspace-write` / `ask` | You are a helpful software engineer assistant. |
| baseline | `zero-anchored-standard-b` | `anchored-standard` | `workspace-write` / `ask` | You are a helpful software engineer assistant. |
| baseline-bash | `anchored-standard` | `anchored-standard-gitbash` | `workspace-write` / `ask` | You are a helpful software engineer assistant. |
| baseline-upstream | `zero-anchored-standard-b` | `anchored-standard → zero-anchored-standard-b → anchored-standard` | `workspace-write` / `ask` | You are a helpful software engineer assistant. |
| baseline2 | `anchored-standard` | `—` | `workspace-write` / `ask` | You are a helpful software engineer assistant. |
| baseline3 | `zero-anchored-standard` | `—` | `workspace-write` / `ask` | You are a helpful software engineer assistant. |
| prompt-adding | `anchored-standard` | `standard` | `workspace-write` / `ask` | You are an AI agent powered by DeepSeek Harness. |
| RL-open | `anchored-standard` | `anchored-standard-open` | `workspace-write` / `ask` | You are a helpful software engineer assistant. |
| try-mc1 | `standard-we-contract` | `zero-anchored-standard-b` | `workspace-write` / `ask` | You are a helpful software engineer assistant. |
| try-mc2 | `zero-anchored-standard` | `—` | `workspace-write` / `ask` | You are a helpful software engineer assistant. |
| try-mc3 | `zero-anchored-standard` | `standard-we-contract` | `workspace-write` / `ask` | You are an AI agent powered by DeepSeek Harness. |

> 结论：大部分实验把系统提示词压成一句话 persona `You are a helpful software engineer assistant.`（Minimal 风格），
> 而 `prompt-adding` / `try-mc3` 保留了完整的 DeepSeek Harness 标准系统提示词；
> 区别主要在“锚定轮 + 工具逐步开放”策略与“推理契约”注入方式，详见包内 `presets/` 目录中的 `agent.cordis.yml`。
