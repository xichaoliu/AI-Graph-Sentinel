 # 全局配置（读取 .env 中的大模型 API Key、数据库地址等）
import os
LLM_NAME = os.getenv("LLM_NAME", "glm-4-flash")
LLM_API_KEY= os.getenv("LLM_API_KEY", "e3b9cfb5fc46496e8526b86130a374a3.CS2roTaOqo056bHn")
LLM_API_BASE = os.getenv("LLM_API_BASE", "https://open.bigmodel.cn/api/paas/v4/")