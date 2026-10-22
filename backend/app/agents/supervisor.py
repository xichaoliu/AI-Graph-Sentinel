from app.core.state import GraphState

def run(state: GraphState):
    has_text = bool(state.get("raw_text"))
    has_nodes = bool(state.get("nodes"))
    is_confirmed = state.get("human_confirmed", False)
    has_report = bool(state.get("final_report"))
    if not has_nodes:
        action = "extractor"
    elif not is_confirmed:
        action = "validator" # 派给 validator 触发 HITL 断点
    elif not has_report:
        action = "analyst"
    else: 
        action = "end"

    print(f"[Supervisor] 决策 -> {action}")
    return {"next_action": action}
