# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# DocuGraph Sentinel - 前端可视化大屏（React + Vite -> nginx）
# ---------------------------------------------------------------------------
FROM node:24-alpine AS deps

WORKDIR /app

COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci --no-audit --no-fund


FROM deps AS build

COPY . .
RUN npm run build


FROM nginx:1.28-alpine AS runtime

ENV TZ=Asia/Shanghai

# 前端路由、HTTPS 与 /api、/internal 反向代理（含 SSE 配置）
COPY nginx.conf /etc/nginx/conf.d/default.conf

# 只把构建产物放进最终镜像
COPY --from=build /app/dist /usr/share/nginx/html

# TLS 证书/私钥不在镜像内，由 docker compose 以只读卷挂载到 /etc/nginx/ssl
# 80 只做 HTTP 健康检查与 HTTPS 跳转，443 提供服务
EXPOSE 80 443
