# 暴露 RESTful 接口 (如 /upload, /confirm)
from fastapi import APIRouter
router = APIRouter(prefix="/internal", tags=["documents"])