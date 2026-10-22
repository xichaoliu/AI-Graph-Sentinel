# 暴露 RESTful 接口 (如 /upload, /confirm)
import uuid, json
from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import List, Dict,Any
from app.core.graph import app_graph
from app.utils.parsers import parse_pdf
router = APIRouter(prefix="/api", tags=["documents"])

class StartReq(BaseModel):
    file_name: str
    thread_id: str

class ConfirmReq(BaseModel):
    thread_id: str
    modified_nodes: List[Dict[str, Any]]
def to_sse(event: str, data) -> str:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"
@router.post("/upload")
async def upload_start(file: UploadFile):
    print(f"\n--- 收到文件上传：{file.filename} ---")
    try:
        # 1、读取文件字节流
        file_bytes = await file.read()
        raw_text = parse_pdf(file.filename, file_bytes=file_bytes)
        config = {"configurable": {"thread_id": str(uuid.uuid4())}}
        # 启动 由于设置了interrupt_after, 它还会在validator 后停下
        app_graph.invoke({"file_name": file.filename, "raw_text": raw_text}, config=config)
        state = app_graph.get_state(config)

        return {
            "status": "paused",
            "nodes": state.values.get("nodes", []),
            "edges": state.values.get("edges", [])
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"文件处理失败: {e}")
    

@router.post("/start")
def start_flow(req: StartReq):
    print("\n--- 启动工作流 ---")
    config = {"configurable": {"thread_id": req.thread_id}}
    # 启动 由于设置了interrupt_after, 它还会在validator 后停下
    app_graph.invoke({"file_name": req.file_name}, config=config)
    # 获取当前被冻结的状态
    state = app_graph.get_state(config)

    return {
        "status": "paused",
        "nodes": state.values.get("nodes", []),
        "edges": state.values.get("edges", [])
    }

@router.post("/confirm")
def confirm_flow(req: ConfirmReq):
    print("\n--- 恢复工作流 ---")
    config = {"configurable": {"thread_id": req.thread_id}}

    # 更新人工修改的数据，并打伤confirmed标记
    app_graph.update_state(
        config,
        {"human_confirmed": True, "nodes": req.modified_nodes}
    )

    # 传入 None 继续往下跑
    final_state  = app_graph.invoke(None, config=config)
    return {"report": final_state.get("final_report")}
    pass