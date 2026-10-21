 # FastAPI 启动入口，挂载路由、配置 CORS
"""启动 uvicorn app.main:app --reload"""
import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api import routes, sse
app = FastAPI(
    title="DocuGraph 智能中枢接口",
    version="0.1.0",
    description= """
### 🚀 DocuGraph Sentinel: 企业级文档图谱推演平台

本系统致力于解决传统 RAG 在复杂企业文档中面临的**“数据碎片化”**与**“大模型幻觉”**问题。通过将非结构化文档转化为结构化的知识图谱，并引入多智能体（Multi-Agent）协同机制，实现高可靠性的自动化业务推演。

---
#### 🧠 核心架构与机制：

*   **Doc-to-Graph (文档图谱化)**: 自动解析 PDF/Word，利用 LLM 抽取深层实体与关系，构建企业级图谱基座。
*   **Multi-Agent Workflow (多智能体协同)**: 采用 LangGraph 编排，划分 *解析员、抽取者、审查员、分析师* 等多个专属 Agent，流水线式处理复杂任务。
*   **Human-in-the-Loop (人在回路)**: 在“抽取”与“分析”之间引入状态机断点（Interrupt）。允许人类专家在前端大屏介入，纠偏实体、修改逻辑，将大模型的不确定性降至最低。
*   **Real-time SSE (流式交互)**: 基于 Server-Sent Events 技术，将 Agent 的思考链（Thought Chain）与图谱节点数据实时推送到前端可视化大屏。

---
#### 🛠️ 技术栈：
`Python 3.11` | `FastAPI` | `LangGraph` | `Neo4j` (可选) | `React` | `ECharts` | `SSE`
""")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(routes.router)
app.include_router(sse.router)
def main() -> None:
    uvicorn.run(
        app,
        host="0.0.0.0",
        port=8000,
        reload=True
    )


if __name__ == "__main__":
    main()
