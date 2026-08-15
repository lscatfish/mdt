# DeepSeek Agent 预设 · 可复现包

本包把本仓库里 **11 个“网页版我的世界”实验会话所用到的 DeepSeek Harness Agent 预设**完整导出，供任何人在自己的 DeepSeek Harness 环境中 1:1 复现这些实验。

## 实验背景

每个实验目录（`baseline`、`RL-open`、`B+template` …）里都有一个 `dsh-session-*.zip`，其中 `session.jsonl` 的开头几行记录了该次实验的完整启动配置：

```jsonl
{"type":"session", ..., "agentPreset":"anchored-standard"}
{"type":"permission/preset", "data":{"preset":"workspace-write"}}
{"type":"sandbox/mode", "data":{"mode":"workspace-write"}}
{"type":"approval/policy", "data":{"policy":"ask"}}
{"type":"agent-preset/selected", "data":{"agentPreset":"anchored-standard-open"}}
```

- `session` 头部里的 `agentPreset` = 会话创建时使用的预设
- `agent-preset/selected` = 空白会话期间切换后的预设（历史由两者共同决定）
- 随后第一条 `agent/inbox/spliced` = 用户任务；第一条 `request/header` 里的 `system` = 实际交给 DeepSeek 的系统提示词

本包用 `tools/extract_sessions.py` 把这 11 个 zip 的开头逐一解析出来，结果在 `sessions/`，每个会话包含：

| 文件 | 内容 |
| --- | --- |
| `metadata.json` | 头部预设、选中预设、权限/沙箱/批准策略、首条任务、锚定注入、首次请求配置 |
| `system-prompt.txt` | 交给 DeepSeek 的 system 提示词全文 |
| `session-prefix.jsonl` | 开头 60 行原始 JSONL（逐段核对用） |
| `README.md` | 该会话开头的人话版摘要 |

## 预设来自哪里

- **9 个自定义实验预设**：其中 7 个导出自本机安装目录 `%USERPROFILE%\.dsh\.agent-presets\`，逐字节复制到 `presets/custom/`；另外 2 个（`anchored-standard-old`、`anchored-standard-upstream`）是从 DeepSeek Harness 源码历史（lscatfish 分支）按会话实际使用的提交形态提取的**历史版本**（B1 / UP 两个会话使用的正是这两个历史形态，详见下方“会话 → 预设版本”）。
- **4 个官方随附预设**：`code` / `cordis` / `minimal` / `standard`，复制自 DeepSeek Harness 源码 `apps/cli/config/agent-presets/`，放在 `presets/shipped/`，供对照。

## 目录结构

```
agent-presets-repro/
├── README.md                     # 本文件
├── presets/
│   ├── custom/                   # 9 个实验预设（可直接安装）
│   │   ├── anchored-standard/            # 当前安装版（B2/B3 用）
│   │   ├── anchored-standard-old/        # 历史版：首轮 cap 1024（B1 用）
│   │   ├── anchored-standard-upstream/   # 历史版：upstream main 形态（UP 用）
│   │   ├── anchored-standard-gitbash/
│   │   ├── anchored-standard-open/   # ← RL-open 最终采用的预设
│   │   ├── standard-we-contract/
│   │   ├── standard-we-contract-b/
│   │   ├── zero-anchored-standard/
│   │   └── zero-anchored-standard-b/
│   └── shipped/                  # 官方 code/cordis/minimal/standard
├── sessions/                     # 11 个会话的开头核对结果（自动生成）
└── tools/
    └── extract_sessions.py       # 从 dsh-session-*.zip 重新生成 sessions/
```

## 9 个自定义预设是什么

| 预设 id | 说明（来自 preset.yml） |
| --- | --- |
| `anchored-standard` | 首轮只给 `bash`/`pwsh` + `read`，首次工具调用或首次回复后开放完整 Standard 工具目录（**当前安装版，无首轮 cap**；B2/B3 用） |
| `anchored-standard-old` | **历史版**（旧版形态）：与当前版机制相同，但首轮带 **1024 token 输出 cap**（`DEFAULT_BOOTSTRAP_MAX_TOKENS = 1024`）（**B1 用**） |
| `anchored-standard-upstream` | **历史版**（upstream main 形态）：首轮用官方 Minimal 真实工具对（**custom-bash Windows bash + `str_replace_editor`**）、晋升后低注入（dev-tool-search / skill-search / instruction-hint / compaction-epoch）（**UP 用**） |
| `anchored-standard-gitbash` | 同上，但 Windows shell 换成 `D:\Git\bin\bash.exe`（解决路径/目录错位问题） |
| `anchored-standard-open` | 首轮严格用官方 Minimal 的真实工具对（`bash` + `str_replace_editor`）、一句 persona、无注入；首次工具调用或回复后**全量开放** Standard 目录，并恢复 AGENTS.md 与技能目录注入 |
| `zero-anchored-standard` | 注入一轮**零工具锚定**（固定用户消息），随后开放完整 Standard 工具目录 |
| `zero-anchored-standard-b` | 零工具锚定 + 宽松推理契约（允许 I/I'll/we，仅禁 `let me`） |
| `standard-we-contract` | 完整 Standard 工具，系统提示常驻第一人称复数推理契约（we/let's，禁止 I/let me） |
| `standard-we-contract-b` | 完整 Standard 工具，常驻宽松推理契约（仅禁 `let me`） |

> 版本差异说明：`anchored-standard` 在实验期间迭代过多次。三个会话各用不同形态，本包已分别导出：
> **B1 = `anchored-standard-old`**（首轮 cap 1024，会话 metadata 实测 `maxTokens: 1024`）、
> **UP = `anchored-standard-upstream`**（首轮 `bash + str_replace_editor`，metadata 实测）、
> **B2/B3 = `anchored-standard`**（当前安装版，metadata 实测 `maxTokens: 256000`）。
> 其余会话按 `sessions/README.md` 的"会话内选中预设"列使用对应预设。

每个预设目录里的 `agent.cordis.yml` 是唯一事实来源，里面的注释写明了 bootstrap 顺序、工具白名单、promote 触发条件、注入抑制清单等全部细节；`.mjs` 文件是随组装加载的插件（锚定轮、工具开放、契约注入等）。

## 复现步骤

1. 准备 DeepSeek Harness 环境（`dsh` 可运行、`%USERPROFILE%\.dsh` 存在）。
2. 安装预设（以 `anchored-standard-open` 为例）：
   ```powershell
   Copy-Item -Recurse presets\custom\anchored-standard-open $env:USERPROFILE\.dsh\.agent-presets\anchored-standard-open
   ```
   （Linux/macOS 对应 `${DSH_HOME:-$HOME/.dsh}/.agent-presets/`。）
3. 打开 Web GUI 新建会话，在预设列表选择刚安装的 id（**按 `sessions/<实验目录>/metadata.json` 的"会话内选中预设"列选择**，注意 B1 → `anchored-standard-old`、UP → `anchored-standard-upstream`）。
4. 按 `sessions/<实验目录>/metadata.json` 对齐设置：
   - permission preset：`workspace-write`
   - sandbox：`workspace-write`
   - approval policy：`ask`
   - provider：`deepseek-official`，model：`deepseek-v4-pro`，reasoningEffort：`max`
5. 在一个空工作目录里发送与实验完全相同的第一条任务：
   > 你只能够修改当前目录下的文件，可以使用git进行版本管理。请复刻一个网页版本的我的世界游戏
6. 对照 `sessions/<实验目录>/session-prefix.jsonl` 与 `system-prompt.txt`，确认开头事件、锚定注入与 system 提示词一致。

> **平台依赖**：`anchored-standard-gitbash` / `anchored-standard-open` / `anchored-standard-upstream` 的 `custom-bash.mjs` 硬编码 `bashPath: 'D:\Git\bin\bash.exe'`（Windows）。Linux/macOS 复现时需把该值改为本机 bash 路径（如 `/bin/bash`），或改用 `anchored-standard`（pwsh 系）并接受首轮工具差异；`anchored-standard` 当前版的 `shellTools: [bash, pwsh]` 在非 Windows 平台由 harness 平台解析决定。

## 会话 → 预设对照（自动提取）

见 `sessions/README.md` 与 `sessions/index.json`。一句话结论：

- 大多数实验的 system 提示词是 Minimal 风格的一句 persona：
  `You are a helpful software engineer assistant.`
- `prompt-adding`（切到官方 `standard`）与 `try-mc3`（切到 `standard-we-contract`）保留了完整的 DeepSeek Harness 标准系统提示词。
- 实验差异集中在“锚定轮 + 工具逐步开放”策略与“推理契约”注入方式上，而不是任务本身。
- **注意**：`baseline`（B1）实际使用的 `anchored-standard` 是带 1024 cap 的历史版（`presets/custom/anchored-standard-old`），`baseline-upstream`（UP）使用的是 upstream main 形态（`presets/custom/anchored-standard-upstream`）——`sessions/README.md` 表里的“会话内选中预设”按 id 记录，版本以本段与预设目录注释为准。

## 重新生成核对结果

```bash
python tools/extract_sessions.py
```

脚本会扫描上级目录 `../*/dsh-session-*.zip`，重新输出 `sessions/`。
