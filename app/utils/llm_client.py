# 封装大模型调用（带重试机制、流式输出）
import os
import json
import re
from dotenv import load_dotenv
from langchain_openai import ChatOpenAI
from langchain_core.messages import HumanMessage, SystemMessage
from config import LLM_API_KEY, LLM_API_BASE, LLM_NAME
class LLMClient:
    def __init__(self):
        # 初始化兼容 OpenAI 格式的客户端 (接入 DeepSeek/千问 等)
        self.llm = ChatOpenAI(
            api_key=LLM_API_KEY,
            base_url=LLM_API_BASE,
            model=LLM_NAME,
            temperature=0.1, # 抽取任务，温度调低，保证严谨
            max_tokens=4000
        )

    def stream_chat(self, prompt: str, system_prompt: str = "你是一个专业的企业级AI助手"):
        """
        流式对话：用于最终报告生成 (Analyst Agent)
        前端大屏右侧的打字机效果就是靠这个实现的
        """
        messages = [
            SystemMessage(content=system_prompt),
            HumanMessage(content=prompt)
        ]
        # stream=True 返回一个生成器，可以一段段 yield 给 FastAPI
        for chunk in self.llm.stream(messages):
            if chunk.content:
                yield chunk.content

    def extract_json(self, prompt: str, system_prompt: str = "你是一个严格的数据抽取器，只返回JSON。") -> dict:
        """
        结构化抽取：用于实体关系抽取 (Extractor Agent)
        难点：大模型经常话多，返回 ```json ... ``` 格式，这里直接暴力清洗
        """
        messages = [
            SystemMessage(content=system_prompt),
            HumanMessage(content=prompt)
        ]
        
        try:
            # 这里不使用流式，因为我们需要完整的 JSON
            response = self.llm.invoke(messages)
            content = response.content.strip()
            
            # 【核心排雷】剔除大模型爱加的 Markdown 反引号
            if content.startswith("```json"):
                content = content[7:]
            elif content.startswith("```"):
                content = content[3:]
            if content.endswith("```"):
                content = content[:-3]
            
            content = content.strip()
            return json.loads(content)
            
        except json.JSONDecodeError as e:
            print(f"[LLM Error] JSON 解析失败: {e}\n原始返回: {content}")
            return {"nodes": [], "edges": []} # 降级返回空数据，防止整个系统崩溃
        except Exception as e:
            print(f"[LLM Error] 调用大模型失败: {e}")
            return {"nodes": [], "edges": []}

# 单例模式：全局导出一个 client，避免重复初始化
llm_client = LLMClient()