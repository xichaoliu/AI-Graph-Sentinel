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

# 前端路由与 /api、/internal 反向代理（含 SSE 配置）
COPY nginx.conf /etc/nginx/conf.d/default.conf

# 只把构建产物放进最终镜像
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80
