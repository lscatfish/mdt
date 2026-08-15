#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
从 MDT 各实验目录的 dsh-session-*.zip 中提取"会话开头"信息：

  * session 头部：创建时使用的 agentPreset
  * permission / sandbox / approval 设置
  * agent-preset/selected 事件（创建后切换过的预设）
  * 第一条真实用户任务消息
  * 锚定轮 / 推理契约注入消息
  * 第一次 request/header 中交给 DeepSeek 的 system 提示词
  * 开头 60 行原始 JSONL（verbatim，便于逐段核对）

用法：
    python tools/extract_sessions.py [--projects-root <MDT目录>] [--out <输出目录>]

默认以脚本所在仓库的父目录为 MDT 根目录，输出到 ../sessions。
"""
import argparse
import json
import zipfile
from pathlib import Path

PREFIX_LINES = 60


def text_of_message(message) -> str:
    """把 dsh 消息对象还原为纯文本。"""
    if not isinstance(message, dict):
        return ""
    content = message.get("content")
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts = []
        for item in content:
            if isinstance(item, dict) and item.get("type") == "text":
                parts.append(item.get("text", ""))
            elif isinstance(item, str):
                parts.append(item)
        return "\n".join(parts)
    return ""


def analyze_zip(zip_path: Path) -> dict:
    with zipfile.ZipFile(zip_path) as zf:
        names = [n for n in zf.namelist() if n.endswith("session.jsonl")]
        root_names = [n for n in names if "/" not in n.replace("\\", "/")]
        main = root_names[0] if root_names else names[0]
        raw_lines = zf.read(main).decode("utf-8").splitlines()

    header = None
    permission = None
    sandbox = None
    approval = None
    selected = []
    end_seed = None
    first_task = None
    anchor_messages = []
    first_request = None
    request_systems = {}
    first_turn = None
    title = None

    for line in raw_lines:
        try:
            obj = json.loads(line)
        except json.JSONDecodeError:
            continue
        t = obj.get("type")
        data = obj.get("data", {})
        if t == "session" and header is None:
            header = {
                "id": obj.get("id"),
                "createdAt": obj.get("createdAt"),
                "cwd": obj.get("cwd"),
                "agentPreset": obj.get("agentPreset"),
            }
        elif t == "permission/preset" and permission is None:
            permission = data.get("preset")
        elif t == "sandbox/mode" and sandbox is None:
            sandbox = data.get("mode")
        elif t == "approval/policy" and approval is None:
            approval = data.get("policy")
        elif t == "agent-preset/selected":
            selected.append({"seq": obj.get("seq"), "agentPreset": data.get("agentPreset")})
        elif t == "session/end-seed" and end_seed is None:
            end_seed = obj.get("seq")
        elif t == "agent/inbox/spliced":
            inserted = data.get("inserted") or []
            for msg in inserted:
                src = (msg.get("source") or {})
                kind = src.get("kind")
                text = text_of_message(msg)
                if kind == "user" and first_task is None and text.strip():
                    first_task = text.strip()
                elif kind == "plugin":
                    anchor_messages.append({
                        "seq": obj.get("seq"),
                        "plugin": src.get("plugin"),
                        "form": src.get("form"),
                        "summary": src.get("summary"),
                        "text": text.strip(),
                    })
        elif t == "request/header" and first_request is None:
            h = data.get("header", {})
            config = h.get("config", {})
            system = h.get("system") or ""
            first_request = {
                "seq": obj.get("seq"),
                "provider": config.get("provider"),
                "model": config.get("model"),
                "reasoningEffort": config.get("reasoningEffort"),
                "maxTokens": config.get("maxTokens"),
                "adapterDefaults": h.get("adapterDefaults"),
                "system": system,
            }
        if t == "request/header":
            h = data.get("header", {}) if isinstance(data, dict) else {}
            sys_text = h.get("system")
            if sys_text is not None:
                request_systems.setdefault(sys_text, {"count": 0, "length": len(sys_text)})
                request_systems[sys_text]["count"] += 1
        if t == "turn/start" and first_turn is None:
            first_turn = {"seq": obj.get("seq"), "turn": data.get("turn")}
        if t == "session/title" and title is None:
            title = data.get("title")

    system_list = [
        {"sha256_prefix": _short_hash(text), "length": v["length"], "count": v["count"],
         "firstLine": text.strip().splitlines()[0] if text.strip() else ""}
        for text, v in request_systems.items()
    ]

    return {
        "session_zip": zip_path.name,
        "total_lines": len(raw_lines),
        "header": header,
        "permission_preset": permission,
        "sandbox_mode": sandbox,
        "approval_policy": approval,
        "agent_preset_selected": selected,
        "end_seed_seq": end_seed,
        "first_user_task": first_task,
        "anchor_messages": anchor_messages,
        "first_request": first_request,
        "all_system_prompts": system_list,
        "first_turn": first_turn,
        "title": title,
        "prefix_raw": "\n".join(raw_lines[:PREFIX_LINES]),
    }


def _short_hash(text: str) -> str:
    import hashlib
    return hashlib.sha256(text.encode("utf-8")).hexdigest()[:16]


def render_readme(info: dict) -> str:
    lines = []
    h = info["header"] or {}
    lines.append(f"# {h.get('cwd','?').split(chr(92))[-1] if h.get('cwd') else '?'} 会话开头核对")
    lines.append("")
    lines.append(f"- 会话文件：`{info['session_zip']}`")
    lines.append(f"- 会话 ID：`{h.get('id')}`")
    lines.append(f"- 创建时预设（session 头部 agentPreset）：`{h.get('agentPreset')}`")
    if info["agent_preset_selected"]:
        chain = " → ".join(s["agentPreset"] for s in info["agent_preset_selected"])
        lines.append(f"- 会话内切换（agent-preset/selected）：`{chain}`")
    else:
        lines.append("- 会话内切换（agent-preset/selected）：无")
    lines.append(f"- 权限预设：`{info['permission_preset']}`；沙箱：`{info['sandbox_mode']}`；批准策略：`{info['approval_policy']}`")
    lines.append(f"- 第一条用户任务：{info['first_user_task'] or '（空）'}")
    if info["anchor_messages"]:
        for a in info["anchor_messages"]:
            lines.append(f"- 锚定/契约注入（{a.get('plugin')}）：")
            lines.append("")
            lines.append("```")
            lines.append(a["text"])
            lines.append("```")
    fr = info["first_request"]
    if fr:
        lines.append(f"- 首次请求：`{fr.get('provider')}` / `{fr.get('model')}` / reasoning={fr.get('reasoningEffort')} / maxTokens={fr.get('maxTokens')}`")
        lines.append("")
        lines.append("## 交给 DeepSeek 的 system 提示词（首次 request/header）")
        lines.append("")
        lines.append("```text")
        lines.append(fr["system"])
        lines.append("```")
    lines.append("")
    lines.append("## 开头原始记录")
    lines.append("")
    lines.append(f"原始 JSONL 前 {PREFIX_LINES} 行保存在同目录 `session-prefix.jsonl`。")
    return "\n".join(lines) + "\n"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    default_root = Path(__file__).resolve().parent.parent.parent
    parser.add_argument("--projects-root", default=str(default_root),
                        help="MDT 项目根目录（默认：脚本上两级目录）")
    parser.add_argument("--out", default=None,
                        help="输出目录（默认：脚本同级的 ../sessions）")
    args = parser.parse_args()

    root = Path(args.projects_root)
    out = Path(args.out) if args.out else Path(__file__).resolve().parent.parent / "sessions"
    out.mkdir(parents=True, exist_ok=True)

    rows = []
    for z in sorted(root.glob("*/dsh-session-*.zip")):
        project = z.parent.name
        print(f"解析 {project} <- {z.name}")
        info = analyze_zip(z)
        info["project"] = project
        project_dir = out / project
        project_dir.mkdir(parents=True, exist_ok=True)
        (project_dir / "metadata.json").write_text(
            json.dumps({k: v for k, v in info.items() if k != "prefix_raw"},
                       ensure_ascii=False, indent=2), encoding="utf-8")
        (project_dir / "system-prompt.txt").write_text(
            (info["first_request"] or {}).get("system", ""), encoding="utf-8")
        (project_dir / "session-prefix.jsonl").write_text(info["prefix_raw"], encoding="utf-8")
        (project_dir / "README.md").write_text(render_readme(info), encoding="utf-8")
        rows.append(info)

    index = {
        "projects": [
            {
                "project": r["project"],
                "session_zip": r["session_zip"],
                "created_preset": (r["header"] or {}).get("agentPreset"),
                "selected_presets": [s["agentPreset"] for s in r["agent_preset_selected"]],
                "permission": r["permission_preset"],
                "sandbox": r["sandbox_mode"],
                "approval": r["approval_policy"],
                "model": (r["first_request"] or {}).get("model"),
                "system_first_line": (r["first_request"] or {}).get("system", "").strip().splitlines()[0],
                "first_user_task": r["first_user_task"],
            }
            for r in rows
        ]
    }
    (out / "index.json").write_text(json.dumps(index, ensure_ascii=False, indent=2), encoding="utf-8")

    table = ["| 实验目录 | 创建时预设 | 会话内选中预设 | 沙箱 / 批准 | 交给 DeepSeek 的 system 首行 |",
             "| --- | --- | --- | --- | --- |"]
    for p in index["projects"]:
        selected = " → ".join(p["selected_presets"]) if p["selected_presets"] else "—"
        sys_line = (p["system_first_line"] or "")[:60]
        table.append(
            f"| {p['project']} | `{p['created_preset']}` | `{selected}` | "
            f"`{p['sandbox']}` / `{p['approval']}` | {sys_line} |")
    readme = [
        "# 会话开头核对报告",
        "",
        "由 `tools/extract_sessions.py` 从各实验目录的 `dsh-session-*.zip` 自动生成。",
        "每个实验子目录包含 `metadata.json`、`system-prompt.txt`、`session-prefix.jsonl`（开头 60 行原文）。",
        "",
        *table,
        "",
        "> 结论：大部分实验把系统提示词压成一句话 persona `You are a helpful software engineer assistant.`（Minimal 风格），",
        "> 而 `prompt-adding` / `try-mc3` 保留了完整的 DeepSeek Harness 标准系统提示词；",
        "> 区别主要在“锚定轮 + 工具逐步开放”策略与“推理契约”注入方式，详见包内 `presets/` 目录中的 `agent.cordis.yml`。",
        "",
    ]
    (out / "README.md").write_text("\n".join(readme), encoding="utf-8")

    print(f"\n完成：{len(rows)} 个会话已解析，输出目录 {out}")


if __name__ == "__main__":
    main()
