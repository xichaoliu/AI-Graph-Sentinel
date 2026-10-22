# 组装 StateGraph，定义节点和条件边 (Workflow)
from langgraph.graph import StateGraph, END
from langgraph.checkpoint.memory import MemorySaver

from app.core.state import GraphState
from app.agents import parser_agent, extractor_agent, validator_agent, analyst_agent, supervisor

# 1. 实例化图
workflow = StateGraph(GraphState)

# 2. 添加节点
workflow.add_node("supervisor", supervisor.run)
workflow.add_node("extractor", extractor_agent.run)
workflow.add_node("validator", validator_agent.run)
workflow.add_node("analyst", analyst_agent.run)

# 3. 设置固定边（流水线）
workflow.set_entry_point("supervisor")
workflow.add_edge("extractor", "supervisor")
workflow.add_edge("validator", "supervisor")
workflow.add_edge("analyst", "supervisor")

# # 4. 设置条件边（处理HITL 恢复）
# def check_human_confirmed(state:GraphState):
#     # 检查人工是否点了确认
#     if state.get("human_confirmed") is True:
#         return "analyst"
#     return END # 如果没有确认，这步就结束（其实是挂起）

# 4. 主管的条件路由
def route_by_supervisor(state: GraphState):
    return state.get("next_action", "end")

workflow.add_conditional_edges(
    "supervisor",
    route_by_supervisor,
    {
        "extractor": "extractor",
        "validator": "validator",
        "analyst": "analyst",
        "end": END
    }
)


# 5. 编译图（加入内存存档器，并设置断点）
memory = MemorySaver()
app_graph = workflow.compile(
    checkpointer=memory,
    interrupt_after=["validator"] # 跑完 validator 强制暂停
)