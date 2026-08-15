# RL-open 会话开头核对

- 会话文件：`dsh-session-session-fb6443f2-c7d1-4f12-ae1a-3a99a0699c00.zip`
- 会话 ID：`session-fb6443f2-c7d1-4f12-ae1a-3a99a0699c00`
- 创建时预设（session 头部 agentPreset）：`anchored-standard`
- 会话内切换（agent-preset/selected）：`anchored-standard-open`
- 权限预设：`workspace-write`；沙箱：`workspace-write`；批准策略：`ask`
- 第一条用户任务：你只能够修改当前目录下的文件，可以使用git进行版本管理。请复刻一个网页版本的我的世界游戏
- 锚定/契约注入（user-approval）：

```
The approval policy changed from "ask" to "never" (changed by the user).
```
- 首次请求：`deepseek-official` / `deepseek-v4-pro` / reasoning=max / maxTokens=256000`

## 交给 DeepSeek 的 system 提示词（首次 request/header）

```text
You are a helpful software engineer assistant.
```

## 开头原始记录

原始 JSONL 前 60 行保存在同目录 `session-prefix.jsonl`。
