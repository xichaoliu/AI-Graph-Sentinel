# 封装 PDF/Word 提取文本的纯工具代码
import io
from pypdf import PdfReader
def parse_pdf(file_name: str, file_bytes):
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
        raw_text = raw_text[:3000]
        print(f"[1. Parser PDF] 解析成功，提取文本长度: {len(raw_text)}")
        return raw_text
    except Exception as e:
        print(f"[1. Parser PDF] 解析失败: {e}")