from utils.llm_client import llm_client

print("--- 测试流式输出 ---")
for text in llm_client.stream_chat("请用一句话介绍什么是多智能体协作。"):
    print(text, end="", flush=True)

print("\n\n--- 测试 JSON 抽取 ---")
mock_text = "青岛海尔是一家制造企业，张瑞敏是创始人。"
prompt = f"""
请从以下文本中抽取实体和关系，并严格按照如下 JSON 格式输出：
{{
  "nodes": [{{"id": "1", "name": "实体名称", "type": "人/公司"}}],
  "edges": [{{"source": "1", "target": "2", "relation": "关系"}}]
}}
文本：{mock_text}
"""
result = llm_client.extract_json(prompt)
print(result)