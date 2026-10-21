 # 全局配置（读取 .env 中的大模型 API Key、数据库地址等）
import os
LLM_NAME = os.getenv("LLM_NAME", "deepseek-flash")
LLM_API_KEY= os.getenv("LLM_API_KEY", "sk-0ed1e83d8afb4664833f7ba9f670efe6")
LLM_API_BASE = os.getenv("LLM_API_BASE", "https://api.deepseek.com")