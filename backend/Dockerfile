# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# DocuGraph Sentinel - 后端（FastAPI + LangGraph）
#
# 构建上下文：backend/
#   requirements.txt  -> 依赖清单
#   app/              -> Python 包，落位到镜像内 /srv/app
#
# 代码统一使用 from app.xxx 导入，因此只需把 /srv 放进 PYTHONPATH。
#
# 注意：HITL 依赖 langgraph 的 MemorySaver，checkpoint 只存在进程内存里，
#       所以 uvicorn 必须保持单 worker，不能通过 --workers 横向扩容。
# ---------------------------------------------------------------------------
FROM python:3.12-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PYTHONPATH=/srv \
    HOME=/home/sentinel \
    TZ=Asia/Shanghai

# 设置 pip 国内镜像源，加速下载（以清华源为例）
ENV PIP_INDEX_URL=https://pypi.tuna.tsinghua.edu.cn/simple
ENV PIP_TRUSTED_HOST=pypi.tuna.tsinghua.edu.cn

# 增加超时时间和重试次数，应对网络波动
ENV PIP_DEFAULT_TIMEOUT=300
ENV PIP_RETRIES=5

WORKDIR /srv

# tzdata 用于容器内日志时间；创建非 root 运行用户
RUN apt-get update \
    && apt-get install -y --no-install-recommends tzdata \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --gid 10001 sentinel \
    && useradd --uid 10001 --gid sentinel --create-home --shell /usr/sbin/nologin sentinel

# 先装依赖，充分利用 Docker 层缓存
COPY requirements.txt /tmp/requirements.txt
# RUN --mount=type=cache,target=/root/.cache/pip \
#     pip install -r /tmp/requirements.txt \
#     && rm -f /tmp/requirements.txt

# 修正缓存目录权限，并安装依赖
RUN --mount=type=cache,target=/root/.cache/pip,uid=0,gid=0 \
    pip install -r /tmp/requirements.txt && \
    rm -f /tmp/requirements.txt

# 只复制 Python 包；app/.env 已被 .dockerignore 排除，运行时由 compose env_file 注入
COPY --chown=sentinel:sentinel app /srv/app

USER sentinel

EXPOSE 8000

# 单 worker：MemorySaver 是进程内状态，多 worker 会导致 HITL resume 找不到 checkpoint
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers", "--forwarded-allow-ips", "*"]
