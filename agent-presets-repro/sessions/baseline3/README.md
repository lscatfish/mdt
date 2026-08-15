# Embodied-Intelligence 会话开头核对

- 会话文件：`dsh-session-session-3f036483-f121-47f3-a341-c7db8bc5e9f9.zip`
- 会话 ID：`session-3f036483-f121-47f3-a341-c7db8bc5e9f9`
- 创建时预设（session 头部 agentPreset）：`zero-anchored-standard`
- 会话内切换（agent-preset/selected）：无
- 权限预设：`workspace-write`；沙箱：`workspace-write`；批准策略：`ask`
- 第一条用户任务：接手文件
- 锚定/契约注入（anchor-turn）：

```
This round is a test. Tools are not open yet; all tools will open next round.
```
- 首次请求：`deepseek-official` / `deepseek-v4-pro` / reasoning=max / maxTokens=256000`

## 交给 DeepSeek 的 system 提示词（首次 request/header）

```text
You are a helpful software engineer assistant.
```

## 开头原始记录

原始 JSONL 前 60 行保存在同目录 `session-prefix.jsonl`。
