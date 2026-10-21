# 节点2：实体抽取（调 LLM，把文本变 JSON）
from pydantic import BaseModel, Field
from typing import List
from app.core.state import GraphState
from app.utils.llm_client import llm_client # 引入唯一实例

class NodeSchema(BaseModel):
    id: str = Field(description="节点的唯一标识")
    name: str = Field(description="实体名称")
    category: str = Field(description="实体分类")

class EdgeSchema(BaseModel):
    source: str = Field(description="起点节点的 id")
    target: str = Field(description="终点节点的 id")
    relation: str = Field(decription="关系描述")

class GraphResult(BaseModel):
    node: List[NodeSchema]
    edges: List[EdgeSchema]

def run(state:GraphState):
    print(f"[2.Extractor Agent ] 正在调用大模型抽取图谱...")
    structured_llm = llm_client.with_structured_output(GraphResult)
    prompt = f"请从一下文本提取实体和关系：\n{state.get("raw_text")}"

    try:
        result = structured_llm.invoke(prompt)
        nodes = [node.model_dump() for node in result.nodes]
        edges = [edge.model_dump() for edge in result.edges]
        return {"nodes": nodes, "edges": edges}
    except Exception as e:
        print(f"[2. Extractor Agent] 抽取失败: {e}")
        return {"nodes": [], "edges": []}