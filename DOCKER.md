# Docker Compose 使用说明

## 服务组成

| 服务 | 技术栈 | 容器端口 | 宿主机端口 |
| --- | --- | --- | --- |
| `backend` | Python 3.12 + FastAPI + LangGraph + uvicorn | 8000 | `${BACKEND_PORT:-8000}` |
| `frontend` | Node 24 构建 Vite 产物 + nginx 1.28 | 80 / 443 | `${HTTP_PORT:-80}` / `${HTTPS_PORT:-443}` |

`frontend` 由 nginx 提供同源服务：

- `http://viasaber.ink`、`http://www.viasaber.ink` 全部 301 到 HTTPS
- `https://viasaber.ink`、`https://www.viasaber.ink` 提供大屏与 API
- `/` 返回大屏静态资源，SPA 路由回退到 `index.html`
- `/api/**` 反向代理到 `backend:8000`
- `/internal/**` 反向代理到 `backend:8000`，已关闭缓冲以支持 SSE
- `/healthz` 在 HTTP 和 HTTPS 下都返回 200（HTTP 用于容器健康检查）
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
├── nginx.conf          # HTTP 跳转 + HTTPS 站点 + SSE 反向代理
└── ssl/
    ├── viasaber.ink_bundle.pem  # 完整证书链（站点证书 + 中间证书）
    ├── viasaber.ink.key         # 私钥（仅部署环境保留）
    ├── viasaber.ink.crt
    └── viasaber.ink.csr
docker-compose.yml
```

## 快速开始

前置条件：

- `viasaber.ink` 和 `www.viasaber.ink` 的 DNS 已解析到部署机
- 防火墙放行 **80 / 443**
- `bigscreen/ssl/` 下存在证书和私钥文件

```bash
# 可选：改宿主机端口 / 时区
cp .env.example .env

# 构建并后台启动
docker compose up -d --build

# 查看状态（等待两个服务都变成 healthy）
docker compose ps
```

访问：

- 大屏：<https://viasaber.ink>
- 大屏（www）：<https://www.viasaber.ink>
- 后端 API 文档：<http://localhost:8000/docs>
- 健康检查：<https://viasaber.ink/healthz>

## HTTPS 证书

证书通过 **只读 volume** 挂载，不打进镜像：

```yaml
volumes:
  - ./bigscreen/ssl:/etc/nginx/ssl:ro
```

nginx 使用：

```nginx
ssl_certificate     /etc/nginx/ssl/viasaber.ink_bundle.pem;
ssl_certificate_key /etc/nginx/ssl/viasaber.ink.key;
```

- `viasaber.ink_bundle.pem` 是完整链（站点证书 + 中间证书），不要只配置 `.crt` 叶子证书
- `ssl/` 已加入 `.gitignore` 和 `.dockerignore`，避免私钥进入 Git / 镜像
- 私钥权限建议保持 `600`：`chmod 600 bigscreen/ssl/viasaber.ink.key`
- 部署到其他机器时，需要把证书按相同路径放到宿主机
- 证书为 TrustAsia DV，当前覆盖 `viasaber.ink` / `www.viasaber.ink`，有效期至 **2027-01-07**

续期/替换证书后执行：

```bash
docker compose exec frontend nginx -t
docker compose exec frontend nginx -s reload
```

如果更换了证书文件名，请同步修改 [bigscreen/nginx.conf](bigscreen/nginx.conf) 中的路径。

TLS 配置包含：

- 仅启用 TLS 1.2 / 1.3
- HSTS（`max-age=31536000; includeSubDomains`）
- HTTP/2
- 80 端口除 `/healthz` 外全部跳转 HTTPS

> 如果把 `.env` 中的 `HTTPS_PORT` 改成了非 443，需要同步修改 nginx 的 301 跳转目标；生产环境建议保持 `443`。

## 大模型配置

`docker-compose.yml` 的 `backend.env_file` 读取 `backend/app/.env`，在运行时注入
`LLM_NAME`、`LLM_API_KEY`、`LLM_API_BASE`。

- `backend/app/.env` 已被 `backend/.dockerignore` 排除，**不会打进镜像**
- 修改 `backend/app/.env` 后执行 `docker compose up -d` 让后端重建容器生效
- 即使没有该文件（`required: false`），`backend/app/config.py` 里的默认值仍可让容器启动

## 常用命令

```bash
docker compose logs -f backend       # 后端日志（Agent 执行过程）
docker compose logs -f frontend      # nginx 访问/错误日志
docker compose restart backend       # 重启后端
docker compose up -d --build backend # 改完后端代码后重新构建
docker compose exec frontend nginx -t        # 校验 nginx 配置
docker compose exec frontend nginx -s reload # 重载配置/证书
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
- **大屏已接 SSE**：上传、解析进度、图谱、HITL 确认和报告流式输出均通过
  `/api/upload`、`/api/confirm` 实时推送；上传限制 PDF 且不超过 3MB。
- **证书分离**：私钥只通过宿主机 volume 挂载，不进入镜像层或构建上下文。

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
本地 Vite 开发仍是 HTTP，只有 Docker 里的 nginx 提供 HTTPS。

## 新增/修改文件

```
docker-compose.yml
.env.example
DOCKER.md
backend/Dockerfile
backend/.dockerignore
bigscreen/Dockerfile
bigscreen/.dockerignore
bigscreen/nginx.conf
bigscreen/ssl/            # 运行时只读挂载，不进入镜像/Git
```
