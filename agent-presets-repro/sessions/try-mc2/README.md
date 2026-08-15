# try-mc2 会话开头核对

- 会话文件：`dsh-session-session-7c5cdb82-0237-45b5-9a89-07c12780dafd.zip`
- 会话 ID：`session-7c5cdb82-0237-45b5-9a89-07c12780dafd`
- 创建时预设（session 头部 agentPreset）：`zero-anchored-standard`
- 会话内切换（agent-preset/selected）：无
- 权限预设：`workspace-write`；沙箱：`workspace-write`；批准策略：`ask`
- 第一条用户任务：你只能够修改当前目录下的文件，可以使用git进行版本管理。请复刻一个网页版本的我的世界游戏
- 锚定/契约注入（anchor-turn）：

```
<system-reminder>
Session reasoning contract (applies to every turn, including tool turns, until the session ends):
reason in first-person plural only — "we", "let's", "our".
Never use first-person singular — "I", "let me", "my".
Begin every analysis with "We need". This is the working mode of this session, not optional style.
</system-reminder>
```
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
