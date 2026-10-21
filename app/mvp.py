"""Day 1: 验证 LangGraph 的 interrupt -> 人工修改 -> resume 闭环。

安装:  pip install langgraph
运行:  python day1_hitl.py
"""
from typing import TypedDict

from langgraph.checkpoint.memory import InMemorySaver
from langgraph.graph import END, START, StateGraph
from langgraph.types import Command, interrupt


class State(TypedDict):
    triples: list   # [(主体, 关系, 客体), ...]
    report: str


def extract(state: State) -> dict:
    # 先用写死的数据，模拟 Extractor 抽取（含一条故意错的）
    print("[extract] 抽取完成")
    return {"triples": [
         ("A公司", "控股", "B公司"),
        ("A公司", "控股", "B公司"),
        ("B公司", "控股", "A公司"),   # 幻觉：和上一条矛盾
    ]}


def human_review(state: State) -> dict:
    print("[human_review] 暂停，等待人工审核...")
    # interrupt 会在这里暂停整个图；resume 传入的值会成为它的返回值
    edited = interrupt({"triples": state["triples"]})
    print("[human_review] 收到人工修改，继续")
    return {"triples": edited}


def report(state: State) -> dict:
    lines = [f"{s} -{r}-> {o}" for s, r, o in state["triples"]]
    return {"report": "最终图谱:\n" + "\n".join(lines)}


builder = StateGraph(State)
builder.add_node("extract", extract)
builder.add_node("human_review", human_review)
builder.add_node("report", report)
builder.add_edge(START, "extract")
builder.add_edge("extract", "human_review")
builder.add_edge("human_review", "report")
builder.add_edge("report", END)

# 没有 checkpointer 就无法暂停恢复，这是关键
graph = builder.compile(checkpointer=InMemorySaver())


if __name__ == "__main__":
    config = {"configurable": {"thread_id": "demo-1"}}  # 同一个 thread_id 才能恢复

    # 第一次运行：会停在 human_review
    result = graph.invoke({"triples": [], "report": ""}, config)
    pending = result["__interrupt__"][0].value
    print("\n待审核的图谱:", pending["triples"])

    # 模拟人工：删掉错误的那条
    fixed = [t for t in pending["triples"] if t != ("B公司", "控股", "A公司")]
    print("人工修改后:", fixed, "\n")

    # 第二次运行：用 Command(resume=...) 恢复
    final = graph.invoke(Command(resume=fixed), config)
    print(final["report"])