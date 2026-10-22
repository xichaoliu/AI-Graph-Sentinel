# 暴露 RESTful 接口 (如 /upload, /confirm)
import uuid, json, io
from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from pypdf import PdfReader
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
def upload_start_flow(file: UploadFile):
    async def gen():
        thread_id = str(uuid.uuid4())
        yield to_sse("threadId", {"text": thread_id})
        yield to_sse("process", {"text": f"收到文档 {file.filename}"})
        file_name = file.filename
        file_bytes = await file.read()
        raw_text = ""
        try:
            if file_name.endswith(".pdf"):
                # 解析 PDF
                reader = PdfReader(io.BytesIO(file_bytes))
                for page in reader.pages:
                    text = page.extract_text()
                    if text:
                        raw_text += text + "\n"
            else:
                # 默认按纯文本处理
                raw_text = file_bytes.decode("utf-8", errors="ignore")
                
            # 截取前 3000 个字符，防止 Token 爆炸（真实企业级应用这里会做切片和分批处理）
            # raw_text = raw_text[:3000]
            print(f"[1. Parser PDF] 解析成功，提取文本长度: {len(raw_text)}")
        except Exception as e:
            print(f"[1. Parser PDF] 解析失败: {e}")
            yield to_sse("error", {"text": "文档解析失败"})
        config = {"configurable": {"thread_id": thread_id}}
        async for event in app_graph.astream({"file_name": file.filename, "raw_text": raw_text}, config=config,stream_mode="updates"):
    # event 形如: {'node_name': {'some_state_key': 'new_value'}}
            for node_name, update in event.items():
                print(f"节点 {node_name} 执行完毕，状态更新: {update}")
                # yield to_sse("process", {"text": f"节点 {node_name} 执行完毕，状态更新: {update}"})
                if node_name != "__interrupt__":
                    yield to_sse("process", {
                        "text": {
                            "node_name": node_name,
                            "update": update,
                            "message": f"节点 {node_name} 执行完毕"
                        }
                    })
        # app_graph.invoke({"file_name": file.filename, "raw_text": raw_text}, config=config)
        # state = app_graph.get_state(config)
        # yield to_sse("graph", {"text":{
        #     "status": "paused",
        #     "nodes": state.values.get("nodes", []),
        #     "edges": state.values.get("edges", [])
        # }})
    return StreamingResponse(
        gen(), 
        media_type="text/event-stream",        
        headers={
        "Cache-Control": "no-cache",
        "X-Accel-Buffering": "no",   # 避免 Nginx 之类的代理缓冲导致不实时
    })


@router.post("/confirm")
def confirm_flow(req: ConfirmReq):
    print("\n--- 恢复工作流 ---")
    config = {"configurable": {"thread_id": req.thread_id}}

    # 更新人工修改的数据，并打上confirmed标记
    app_graph.update_state(
        config,
        {"human_confirmed": True, "nodes": req.modified_nodes}
    )

    # 传入 None 继续往下跑
    final_state  = app_graph.invoke(None, config=config)
    return {"report": final_state.get("final_report")}
    pass

