# Deploy

这个项目现在用 Docker Compose 部署两个服务：

| 服务 | 容器内端口 | 服务器端口 | 说明 |
| --- | ---: | ---: | --- |
| `ncm-api` | `3000` | `3500` | 原网易云音乐 API，已加 JWT 鉴权 |
| `custom-backend` | `4000` | `3510` | 你自己的后端，负责登录和签发 JWT |

部署后访问：

```text
音乐 API:      http://服务器IP:3500
你的业务后端:  http://服务器IP:3510
```

## GitHub Actions 部署

工作流文件：

```text
.github/workflows/deploy.yml
```

它会通过 SSH 登录服务器，在服务器上拉取当前仓库，然后执行：

```bash
docker compose up -d --build --remove-orphans
```

## 必填 Secrets

在 GitHub 仓库的 `Settings -> Secrets and variables -> Actions` 里添加：

| 名称 | 类型 | 说明 |
| --- | --- | --- |
| `DEPLOY_HOST` | Secret | 服务器 IP 或域名 |
| `DEPLOY_USER` | Secret | SSH 用户名 |
| `DEPLOY_SSH_KEY` | Secret | SSH 私钥 |
| `API_AUTH_JWT_SECRET` | Secret | JWT 强随机密钥，两个服务共用 |

可选 Secret：

| 名称 | 说明 |
| --- | --- |
| `DEPLOY_PORT` | SSH 端口，默认 `22` |
| `DEPLOY_PATH` | 服务器上的部署目录，默认 `$HOME/api-enhanced` |
| `APP_DEMO_USER_EMAIL` | 本地演示登录账号 |
| `APP_DEMO_USER_PASSWORD` | 本地演示登录密码 |
| `PROXY_URL` | 代理地址 |
| `NETEASE_COOKIE` | 网易云 Cookie |

## 可选 Variables

这些可以放在 GitHub Actions Variables：

| 名称 | 默认值 |
| --- | --- |
| `API_AUTH_JWT_ISSUER` | `app-backend` |
| `API_AUTH_JWT_AUDIENCE` | `ncm-api` |
| `APP_JWT_EXPIRES_IN_SECONDS` | `3600` |
| `APP_ENABLE_DEMO_LOGIN` | `false` |
| `CORS_ALLOW_ORIGIN` | `*` |
| `ENABLE_PROXY` | `false` |
| `ENABLE_GENERAL_UNBLOCK` | `false` |
| `ENABLE_FLAC` | `true` |
| `SELECT_MAX_BR` | `false` |
| `FOLLOW_SOURCE_ORDER` | `true` |

## 服务器要求

服务器需要提前安装：

```bash
git
docker
docker compose
```

并确保防火墙或安全组放行：

```text
3500
3510
```

## 本地容器测试

先准备 `.env`：

```env
API_AUTH_ENABLED=true
API_AUTH_JWT_SECRET=换成强随机字符串
API_AUTH_JWT_ISSUER=app-backend
API_AUTH_JWT_AUDIENCE=ncm-api
APP_ENABLE_DEMO_LOGIN=true
APP_DEMO_USER_EMAIL=demo@example.com
APP_DEMO_USER_PASSWORD=demo-password
```

启动：

```bash
docker compose up -d --build
```

测试业务后端：

```bash
curl -X POST http://127.0.0.1:3510/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"demo@example.com","password":"demo-password"}'
```

拿到 `accessToken` 后测试音乐 API：

```bash
curl 'http://127.0.0.1:3500/cloudsearch?keywords=周杰伦&type=1' \
  -H 'Authorization: Bearer <accessToken>'
```
