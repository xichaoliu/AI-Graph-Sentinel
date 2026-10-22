# 节点4：最终报告（调 LLM，基于审核后的 JSON 写报告）
from app.core.state import GraphState
from app.utils.llm_client import llm_client

def run(state: GraphState):
    print(f"[5. Analyst Agent] 收到人工确认。当前图谱节点数：{len(state.get('nodes', []))}")

    prompt = f"根据一下实体生成分析报告： {state.get('nodes')}"

    response = llm_client.invoke(prompt)

    report = response.content

    return {"final_report": report}