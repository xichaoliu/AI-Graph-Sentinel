# 封装大模型调用（带重试机制、流式输出）
import os
import json
import re
from dotenv import load_dotenv
from langchain_openai import ChatOpenAI
from langchain_core.messages import HumanMessage, SystemMessage
from app.config import LLM_API_KEY, LLM_API_BASE, LLM_NAME

base_llm = ChatOpenAI(
            api_key=LLM_API_KEY,
            base_url=LLM_API_BASE,
            model=LLM_NAME,
            temperature=0, # 抽取任务，温度调低，保证严谨
            max_tokens=4000
        )

# 单例模式：全局导出一个 client，避免重复初始化
llm_client = base_llm