# Docker Compose 使用说明

## 服务组成

| 服务 | 技术栈 | 容器端口 | 宿主机端口 |
| --- | --- | --- | --- |
| `backend` | Python 3.12 + FastAPI + LangGraph + uvicorn | 8000 | `${BACKEND_PORT:-8000}` |
| `frontend` | Node 24 构建 Vite 产物 + nginx 1.28 | 80 | `${FRONTEND_PORT:-8080}` |

`frontend` 只暴露 nginx，同一个源下：

- `/` 返回大屏静态资源，SPA 路由回退到 `index.html`
- `/api/**` 反向代理到 `backend:8000`
- `/internal/**` 反向代理到 `backend:8000`，已关闭缓冲以支持 SSE
- 后端另有独立端口，方便直接访问 Swagger 文档

## 目录结构

```text
backend/
├── Dockerfile          # 后端镜像（build context: ./backend）
├── .dockerignore
├── requirements.txt
└── app/                # FastAPI 业务包
bigscreen/
├── Dockerfile          # 前端镜像（build context: ./bigscreen）
├── .dockerignore
└── nginx.conf
docker-compose.yml
```

## 快速开始

```bash
# 可选：改宿主机端口 / 时区
cp .env.example .env

# 构建并后台启动
docker compose up -d --build

# 查看状态（等待两个服务都变成 healthy）
docker compose ps
```

访问：

- 大屏：<http://localhost:8080>
- 后端 API 文档：<http://localhost:8000/docs>
- 健康检查：`http://localhost:8080/healthz`

## 大模型配置

`docker-compose.yml` 的 `backend.env_file` 读取 `backend/app/.env`，在运行时注入
`LLM_NAME`、`LLM_API_KEY`、`LLM_API_BASE`。

- `backend/app/.env` 已被 `backend/.dockerignore` 排除，**不会打进镜像**
- 修改 `backend/app/.env` 后执行 `docker compose up -d` 让后端重建容器生效
- 即使没有该文件（`required: false`），`backend/app/config.py` 里的默认值仍可让容器启动

## 常用命令

```bash
docker compose logs -f backend       # 后端日志（Agent 执行过程）
docker compose logs -f frontend      # nginx 访问日志
docker compose restart backend       # 重启后端
docker compose up -d --build backend # 改完后端代码后重新构建
docker compose down                  # 停止并移除容器与网络
docker compose down --rmi local      # 连同本地镜像一起清理
```

## 设计说明

- **单 worker**：HITL 依赖 LangGraph `MemorySaver`，checkpoint 存在进程内存中；
  多 worker 会导致 `/api/confirm` 找不到暂停时的状态，因此后端固定单进程。
- **Python 3.12**：`extractor_agent.py` 使用了 3.12 才支持的 f-string 嵌套引号写法，
  镜像固定为 `python:3.12-slim`，本地开发也请使用 3.12+。
- **导入路径**：镜像内代码位于 `/srv/app`，`PYTHONPATH=/srv`；
  代码统一使用 `from app.xxx`（含 `from app.config import ...`）。
- **构建上下文**：后端为 `./backend`（能同时拿到 `requirements.txt` 和 `app/`），
  前端为 `./bigscreen`；Dockerfile 均放在各自服务根目录。
- **健康检查**：后端请求 `/openapi.json`，前端请求 nginx `/healthz`；
  `frontend` 会等 `backend` 变为 healthy 后再启动。
- **依赖缓存**：两个 Dockerfile 都是先复制依赖清单再复制源码，
  并使用了 BuildKit 的 pip / npm 缓存挂载，重复构建更快。
- **非 root**：后端以 UID 10001 的 `sentinel` 用户运行。
- **无状态**：所有流程状态都在后端内存中，重建后端容器后 HITL 会话会丢失；
  后续接入 Redis/数据库 checkpointer 后可持久化。
- 当前大屏使用前端内置的演示数据，接口代理已配好，
  后续把假数据替换成 `/api`、`/internal` 的 SSE 调用即可。

## 本地热更新（不使用 Compose 时）

```bash
# 后端（Python 3.12+）
cd backend
set -a && source app/.env && set +a   # 代码未调用 load_dotenv，这里手动导出
PYTHONPATH=. uvicorn app.main:app --reload --port 8000

# 前端
cd bigscreen && npm install && npm run dev
```

Vite 默认监听 5173，并已通过 `server.proxy` 把 `/api`（含 SSE）代理到
`http://127.0.0.1:8000`；需要改地址时可用 `VITE_API_PROXY` 覆盖。

## 新增文件

```
docker-compose.yml
.env.example
DOCKER.md
backend/Dockerfile
backend/.dockerignore
bigscreen/Dockerfile
bigscreen/.dockerignore
bigscreen/nginx.conf
```
