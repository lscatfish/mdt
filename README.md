# MDT — 网页版我的世界 · Agent 预设实验集

本仓库是 11 个用 DeepSeek Harness 复刻“网页版我的世界”的实验目录的完整快照，以及把每个实验所用 **Agent 预设** 单独导出后的可复现包。

## 实验条件与结论声明（务必先读）

- **未完全控制变量**：11 个会话的实验条件存在略微偏差（例如 Full access 权限开启时机不一致——有的会话一开头就开启，有的执行到中途某一步才开启；另有 n=1 未重复跑、单用户主观评级等），详见综合报告 0.5 节。
- **结果仅供参考**：不保证可复现，不保证为真。
- **结论不代表作者观点**：本仓库分析与报告中的结论仅是对这组实验数据的记录与归纳，不构成作者（实验者）对其正确性或普适性的背书。
- **结论仅对本次"许愿式生成"实验有效**：所有结论只适用于"只给愿望式任务、不给工程指令"这一种生成方式下的这一个任务，**不能说明其他任何场景、任何任务、任何配置下的一切情况**。

## 最终结果

**十一会话思维链综合报告（正式版，含实验性质、结论边界与免责声明）**：

```
docs/session-analysis/COMPREHENSIVE-REPORT-20260815.md
```

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

9 个自定义预设的完整定义（`preset.yml` + `agent.cordis.yml` + 插件 `.mjs`）在：

```
agent-presets-repro/presets/custom/
```

其中 `anchored-standard-old`（B1 用，首轮 cap 1024）与 `anchored-standard-upstream`（UP 用，custom-bash + 低注入）为按会话实际使用的源码历史形态导出的版本，与当前安装版 `anchored-standard`（B2/B3 用）不同。

安装/复现步骤见 `agent-presets-repro/README.md`。

## 分析文档（思维链研究）

11 个会话的思维链分析（宏观轨迹 + 微观指纹 + 交付实测 + 结论边界）在：

```
docs/session-analysis/
```

- `COMPREHENSIVE-REPORT-20260815.md` — **综合报告（正式版）**：十一会话启动说明、许愿式生成实验性质说明（0.4）、结论边界与免责声明（0.5）、交付实测、总表、宏观/微观全量结果、modeltest 交叉验证、版本形态附录
- `rl-open-session-analysis-20260816.md` — RL-open（anchored-standard-open 首跑）单会话分析
- 其余各会话单文档与指纹过程文档，索引见 `docs/session-analysis/README.md`

## 恢复某个实验目录的原始 git 历史

各目录原来的 `.git` 已打包为 bundle 保存在 `preserved-git-history/`。例如恢复 `RL-open`：

```bash
git clone preserved-git-history/RL-open.bundle RL-open-restored
```

## License

[MIT](LICENSE)（代码、预设配置与分析文档）
