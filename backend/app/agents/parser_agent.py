# 节点1：文档解析（不调大模型，纯 Python 提取 PDF 文本）
from app.core.state import GraphState

def run(state: GraphState):
    print(f"\n[1.Parser 正在解析文档]： {state.get('file_name')}")
    # 真实场景这里用pypdf 提取
    return {"raw_text": "青岛某某公司与张三签订了合同，金额50万。"}