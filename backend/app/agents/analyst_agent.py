# 节点4：最终报告（调 LLM，基于审核后的 JSON 流式生成报告）
from typing import Any, Callable, List

from app.core.state import GraphState
from app.utils.llm_client import llm_client

try:
    # 在节点内把增量数据写入 LangGraph 的 custom 流
    from langgraph.config import get_stream_writer
except ImportError:  # 兼容未提供该 API 的旧版 langgraph
    get_stream_writer = None  # type: ignore[assignment]


def _noop_writer(_: Any) -> None:
    return None


def _get_writer() -> Callable[[Any], None]:
    """获取 custom 流写入器；非流式调用（如 invoke）时退化为 no-op。"""
    if get_stream_writer is None:
        return _noop_writer
    try:
        return get_stream_writer()
    except Exception:
        return _noop_writer


def _chunk_text(chunk: Any) -> str:
    """提取 AIMessageChunk 的文本增量，兼容字符串与多模态 content 列表。"""
    content = getattr(chunk, "content", "")
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts: List[str] = []
        for item in content:
            if isinstance(item, str):
                parts.append(item)
            elif isinstance(item, dict) and item.get("type") == "text":
                parts.append(item.get("text", ""))
        return "".join(parts)
    return ""


def run(state: GraphState):
    print(f"[5. Analyst Agent] 收到人工确认。当前图谱节点数：{len(state.get('nodes', []))}")

    prompt = f"根据一下实体生成分析报告： {state.get('nodes')}"

    writer = _get_writer()
    parts: List[str] = []

    # 逐 token 生成报告，同时写入 custom 流供 /api/confirm 转发为 SSE
    for chunk in llm_client.stream(prompt):
        text = _chunk_text(chunk)
        if not text:
            continue
        parts.append(text)
        try:
            writer({"token": text})
        except Exception:
            # 没有开启 custom 流时忽略，最终仍会返回完整报告
            pass

    report = "".join(parts)
    return {"final_report": report}
