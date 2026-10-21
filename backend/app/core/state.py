 # 定义全局共享状态 (TypedDict) - 极其重要

from typing import TypedDict, List, Dict, Any, Annotated
import operator

class GraphState(TypedDict):
    # 用户原始输入
    file_name: str
    raw_text: str                 # Parser 提取出的原始文本
    # 抽取的中间结果
    nodes: List[Dict[str, Any]]   # Echarts 需要的节点 [{"id": "1", "name": "张三"}]
    edges: List[Dict[str, Any]]   # Echarts 需要的线 [{"source": "1", "target": "2"}]
    # 审查与报告
    conflicts: List[str]          # Validator 找出的矛盾点，用于大屏弹窗提醒
    final_report: str             # Analyst 生成的 Markdown
    
    # 控制路由的状态
    next_action: str              # 指示下一步去哪个节点
    human_confirmed: bool         # 人类是否已在前端点击了确认