# 处理 SSE 流式输出 (核心：把 LangGraph 的 state 吐给前端)
from fastapi import APIRouter
router = APIRouter(prefix="/internal", tags=["sse"])