  # 节点3：冲突审查（方案一：调 LLM，对比抽取结果找茬；方案二：纯规则）
from app.core.state import GraphState

def run(state:GraphState):
    print("[3. Validator Agent] 审查完毕，等待前端人工确认...")
    # 注意：这里不返回 human_confirmed, 它默认为空/False
    return {}