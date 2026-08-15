# MDT — 网页版我的世界 · Agent 预设实验集

本仓库是 `D:\code\mdt` 的完整快照：**11 个用 DeepSeek Harness 复刻“网页版我的世界”的实验目录**，以及把每个实验所用 **Agent 预设** 单独导出后的可复现包。

## 顶层目录

| 目录 | 说明 |
| --- | --- |
| `RL-open/` | 最终版本：完整网页版我的世界（Three.js + 程序化体素地形 + 昼夜循环 + 存档） |
| `baseline/` `baseline2/` `baseline3/` `baseline-upstream/` `baseline-bash/` | 不同策略的基线对照实验 |
| `B+template/` | B+ 模板实验 |
| `prompt-adding/` | 在任务提示里追加额外约束的实验 |
| `try-mc1/` `try-mc2/` `try-mc3/` | 早期尝试版本 |
| `agent-presets-repro/` | **Agent 预设可复现包**（见其中 README） |
| `agent-presets-repro.zip` | 上述包的打包版本，便于分发 |
| `preserved-git-history/` | 各实验目录原 `.git` 历史的 git bundle 存档 |

## 每个实验目录里有什么

- 完整源码与静态资源（`node_modules` 按各目录 `.gitignore` 忽略）
- `dsh-session-*.zip`：本次实验的完整会话记录（`session.jsonl`），开头几行记录着创建时预设、权限/沙箱/批准策略、会话内切换的预设，以及交给 DeepSeek 的 system 提示词
- 各实验目录的 `README.md`：该版本的功能说明

## Agent 预设说明

11 个会话的开头已逐个解析，核对报告在：

```
agent-presets-repro/sessions/README.md
```

7 个自定义预设的完整定义（`preset.yml` + `agent.cordis.yml` + 插件 `.mjs`）在：

```
agent-presets-repro/presets/custom/
```

安装/复现步骤见 `agent-presets-repro/README.md`。

## 恢复某个实验目录的原始 git 历史

各目录原来的 `.git` 已打包为 bundle 保存在 `preserved-git-history/`。例如恢复 `RL-open`：

```bash
git clone preserved-git-history/RL-open.bundle RL-open-restored
```
