# Custom Backend 开发文档

这个目录是你自己的业务后端。它和项目根目录里的网易云音乐 API 分开维护：

- `custom-backend/`：你的业务后端，例如登录、用户资料、会员状态、收藏同步、订单等。
- `server.js`、`module/`、`util/`、`plugins/`：原网易云音乐 API 项目代码，主要负责转发和封装音乐接口。

以后尽量不要把业务登录、用户系统、订单等代码写进根目录的 `module/`，这样方便继续同步上游网易云 API 项目，也方便把“你的业务”和“音乐接口”拆开部署。

## 你可以这样理解这个框架

这个后端用的是 Express。你如果只写过 Next.js API，可以先按下面的方式类比：

| Next.js API | Express |
| --- | --- |
| `app/api/login/route.ts` 或 `pages/api/login.ts` | `custom-backend/routes/auth.js` |
| `export async function POST(req)` | `router.post('/login', async (req, res) => {})` |
| `await req.json()` | `req.body` |
| `return Response.json(data)` | `res.status(200).send(data)` |
| 中间件、helper 函数 | `middleware/`、`services/`、`auth/` |

核心差别是：Next.js 按文件路径自动生成路由，Express 需要你手动注册路由。

例如现在入口文件里有：

```js
app.use('/auth', createAuthRouter(config))
app.use('/users', createMeRouter(config))
```

所以 `routes/auth.js` 里的：

```js
router.post('/login', async (req, res) => {})
```

最终访问路径就是：

```text
POST /auth/login
```

`routes/me.js` 里的：

```js
router.get('/me', requireAuth, (req, res) => {})
```

最终访问路径就是：

```text
GET /users/me
```

## 目录结构

```text
custom-backend/
  index.js              后端入口，创建 Express app，注册全局中间件和路由
  config.js             读取环境变量，集中管理端口、JWT、Supabase 配置
  routes/
    auth.js             登录、注册、验证码接口
    me.js               当前用户接口示例
  services/
    users.js            用户相关业务逻辑，当前负责调用 Supabase Auth
  middleware/
    auth.js             业务后端自己的登录态校验中间件
  auth/
    jwt.js              签发业务 JWT
```

建议保持这个分层：

- `routes/`：只做参数校验、调用 service、返回 JSON。
- `services/`：写业务逻辑，例如调用 Supabase、数据库、第三方接口。
- `middleware/`：写通用拦截逻辑，例如校验登录态、权限、限流。
- `auth/`：写和 token、密码、认证相关的底层工具。
- `config.js`：只读环境变量，不写业务逻辑。

## 本地启动

项目要求 Node.js 20 或更高版本。

安装依赖：

```bash
npm ci
```

创建或设置环境变量：

```bash
API_AUTH_JWT_SECRET=test-secret
API_AUTH_JWT_ISSUER=app-backend
API_AUTH_JWT_AUDIENCE=ncm-api
APP_BACKEND_PORT=4000
APP_BACKEND_HOST=127.0.0.1
APP_ENABLE_DEMO_LOGIN=false
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_PUBLISHABLE_KEY=sb_publishable_xxx
```

启动你的业务后端：

```bash
npm run app-backend
```

开发时建议用自动重启：

```bash
npm run app-backend:dev
```

健康检查：

```http
GET http://127.0.0.1:4000/health
```

正常返回：

```json
{
  "code": 200,
  "status": "ok",
  "service": "custom-backend"
}
```

## 环境变量说明

| 变量 | 是否必填 | 说明 |
| --- | --- | --- |
| `API_AUTH_JWT_SECRET` | 是 | 签发和校验业务 JWT 的密钥，生产环境必须换成强随机字符串 |
| `API_AUTH_JWT_ISSUER` | 否 | JWT issuer，默认 `app-backend` |
| `API_AUTH_JWT_AUDIENCE` | 否 | JWT audience，默认 `ncm-api`，音乐 API 校验时要一致 |
| `APP_JWT_EXPIRES_IN_SECONDS` | 否 | accessToken 有效期，默认 3600 秒 |
| `APP_JWT_REFRESH_EXPIRES_IN_SECONDS` | 否 | refreshToken 有效期，默认 2592000 秒，也就是 30 天 |
| `APP_BACKEND_PORT` | 否 | 业务后端端口，默认 4000 |
| `APP_BACKEND_HOST` | 否 | 监听地址，默认 `127.0.0.1` |
| `SUPABASE_URL` | 注册登录需要 | Supabase 项目 URL |
| `SUPABASE_PUBLISHABLE_KEY` | 注册登录需要 | Supabase publishable key，也兼容 `SUPABASE_ANON_KEY` |
| `APP_ENABLE_DEMO_LOGIN` | 否 | 没有 Supabase 时是否启用演示登录 |
| `APP_DEMO_USER_EMAIL` | 否 | 演示登录邮箱 |
| `APP_DEMO_USER_PASSWORD` | 否 | 演示登录密码 |

注意：`API_AUTH_JWT_SECRET`、`API_AUTH_JWT_ISSUER`、`API_AUTH_JWT_AUDIENCE` 要同时给业务后端和音乐 API 使用。业务后端负责签发 token，音乐 API 负责校验 token。

## 当前调用链

```text
App / Web
  -> POST custom-backend /auth/signup/code
  -> POST custom-backend /auth/signup 或 /auth/login
  <- 拿到 accessToken 和 refreshToken
  -> 调用音乐 API 时带 Authorization: Bearer <accessToken>
  -> accessToken 过期后 POST custom-backend /auth/refresh 换新 accessToken
```

也就是说：

- 用户系统归 `custom-backend` 管。
- 音乐接口归原来的网易云 API 服务管。
- 两边通过同一套 JWT 配置打通。

## 注册接口

第 1 步：发送邮箱验证码。

```http
POST http://127.0.0.1:4000/auth/signup/code
Content-Type: application/json

{
  "email": "user@example.com"
}
```

成功返回：

```json
{
  "code": 200,
  "msg": "Verification code sent",
  "data": {
    "email": "user@example.com"
  }
}
```

第 2 步：用户填写验证码和密码，完成注册。

```http
POST http://127.0.0.1:4000/auth/signup
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "12345678",
  "username": "demo-user",
  "code": "123456"
}
```

成功返回：

```json
{
  "code": 201,
  "data": {
    "accessToken": "...",
    "refreshToken": "...",
    "tokenType": "Bearer",
    "expiresIn": 3600,
    "refreshExpiresIn": 2592000,
    "user": {
      "id": "supabase-user-id",
      "email": "user@example.com",
      "username": "demo-user"
    }
  }
}
```

## 登录接口

```http
POST http://127.0.0.1:4000/auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "12345678"
}
```

成功返回：

```json
{
  "code": 200,
  "data": {
    "accessToken": "...",
    "refreshToken": "...",
    "tokenType": "Bearer",
    "expiresIn": 3600,
    "refreshExpiresIn": 2592000,
    "user": {
      "id": "supabase-user-id",
      "email": "user@example.com"
    }
  }
}
```

App 端保存 `data.accessToken`。之后调用需要鉴权的音乐 API 时带上：

```http
Authorization: Bearer <accessToken>
```

例如：

```http
GET http://127.0.0.1:3000/cloudsearch?keywords=周杰伦&type=1
Authorization: Bearer <accessToken>
```

`accessToken` 过期后，用 `refreshToken` 换一个新的 `accessToken`：

```http
POST http://127.0.0.1:4000/auth/refresh
Content-Type: application/json

{
  "refreshToken": "..."
}
```

成功返回：

```json
{
  "code": 200,
  "data": {
    "accessToken": "...",
    "tokenType": "Bearer",
    "expiresIn": 3600,
    "user": {
      "id": "supabase-user-id",
      "email": "user@example.com"
    }
  }
}
```

注意：`refreshToken` 只发给业务后端的 `/auth/refresh`，不要放到音乐 API 的 `Authorization` 里。

## 获取当前用户

`/users/me` 是一个需要登录的业务接口示例。

```http
GET http://127.0.0.1:4000/users/me
Authorization: Bearer <accessToken>
```

成功返回：

```json
{
  "code": 200,
  "data": {
    "id": "supabase-user-id",
    "email": "user@example.com",
    "username": "demo-user"
  }
}
```

这个接口展示了怎么读取登录用户：

```js
router.get('/me', requireAuth, (req, res) => {
  res.send({
    code: 200,
    data: {
      id: req.user.sub,
      email: req.user.email,
      username: req.user.username,
    },
  })
})
```

只要路由里加了 `requireAuth`，就可以从 `req.user` 拿到 JWT payload。

## 怎么新增一个接口

假设你要加一个“获取会员状态”的接口：

```text
GET /memberships/me
```

推荐步骤如下。

### 1. 新建 service

新建 `custom-backend/services/memberships.js`：

```js
async function getMyMembership(userId) {
  return {
    userId,
    plan: 'free',
    active: false,
  }
}

module.exports = {
  getMyMembership,
}
```

service 里后面可以换成查 Supabase 表、MySQL、Redis 或第三方支付接口。

### 2. 新建 route

新建 `custom-backend/routes/memberships.js`：

```js
const express = require('express')
const { createAppAuthMiddleware } = require('../middleware/auth')
const { getMyMembership } = require('../services/memberships')

function createMembershipsRouter(config) {
  const router = express.Router()
  const requireAuth = createAppAuthMiddleware(config.jwt)

  router.get('/me', requireAuth, async (req, res) => {
    try {
      const membership = await getMyMembership(req.user.sub)

      res.send({
        code: 200,
        data: membership,
      })
    } catch (error) {
      res.status(500).send({
        code: 500,
        msg: error.message || 'Internal Server Error',
      })
    }
  })

  return router
}

module.exports = {
  createMembershipsRouter,
}
```

### 3. 在入口注册路由

编辑 `custom-backend/index.js`：

```js
const { createMembershipsRouter } = require('./routes/memberships')

// ...

app.use('/memberships', createMembershipsRouter(config))
```

最后访问：

```http
GET /memberships/me
```

这和 Next.js 最大的区别就是：Next.js 文件路径就是路由；Express 需要在 `index.js` 里手动 `app.use()`。

## 怎么写参数校验

现在项目没有引入 zod 或 joi，所以先用普通 JS 校验。模式可以参考 `routes/auth.js`：

```js
function validateEmail(req, res) {
  const { email } = req.body || {}

  if (!email) {
    res.status(400).send({
      code: 400,
      msg: '邮箱不能为空',
    })
    return null
  }

  return {
    email,
  }
}
```

路由里这样用：

```js
const body = validateEmail(req, res)

if (!body) {
  return
}
```

后面接口变多以后，可以再统一封装错误处理和校验工具。现在先保持简单，避免一开始引太多框架。

## 怎么写需要登录的接口

使用 `createAppAuthMiddleware(config.jwt)`：

```js
const requireAuth = createAppAuthMiddleware(config.jwt)

router.post('/something', requireAuth, async (req, res) => {
  const userId = req.user.sub

  res.send({
    code: 200,
    data: {
      userId,
    },
  })
})
```

请求时必须带：

```http
Authorization: Bearer <accessToken>
```

如果没带 token，会返回：

```json
{
  "code": 401,
  "msg": "Unauthorized"
}
```

如果 token 无效或过期，会返回：

```json
{
  "code": 401,
  "msg": "Invalid token"
}
```

## Supabase 设置

在 Supabase Dashboard 里：

```text
Authentication -> Providers -> Email
```

打开 Email 登录。

然后到邮件模板里把 Magic Link 模板改成验证码邮件：

```text
Authentication -> Email Templates -> Magic Link
```

模板里不要只放 `{{ .ConfirmationURL }}`，要展示 `{{ .Token }}`，例如：

```html
<h2>你的验证码</h2>
<p>验证码：{{ .Token }}</p>
```

Supabase 的 Email OTP 和 Magic Link 共用这套模板。如果模板里还是链接，用户收到的就仍然是验证链接，不是验证码。

## 和网易云音乐 API 的关系

业务后端签发的是你自己的 JWT，不是网易云 cookie。

两者不要混用：

- `accessToken`：你的业务登录态，用来证明“这是你 App 的用户”。
- `refreshToken`：你的业务刷新凭证，只用来请求 `/auth/refresh` 换新的 `accessToken`。
- 网易云 `cookie`：网易云账号登录态，用来调用网易云相关接口。

调用音乐 API 时：

```http
Authorization: Bearer <accessToken>
```

如果某个网易云接口还需要网易云 cookie，仍然按原项目规则传 `cookie` 参数或 `Cookie` header。

## 常见开发流程

1. 在 `services/` 里写业务函数。
2. 在 `routes/` 里写接口，做参数校验和返回 JSON。
3. 需要登录就加 `requireAuth`。
4. 在 `index.js` 里 `app.use('/xxx', createXxxRouter(config))`。
5. 用 `npm run app-backend:dev` 启动。
6. 用 Postman、curl、前端 fetch 或安卓请求测试。
7. 再决定是否要让音乐 API 也依赖这个登录态。

## 返回格式约定

建议所有接口保持这个格式：

成功：

```json
{
  "code": 200,
  "data": {}
}
```

失败：

```json
{
  "code": 400,
  "msg": "错误原因"
}
```

需要创建资源时可以用 HTTP `201`，例如注册成功：

```json
{
  "code": 201,
  "data": {}
}
```

## 前端或 App 怎么调用

如果你在 Next.js 里原来这样写：

```ts
await fetch('/api/login', {
  method: 'POST',
  body: JSON.stringify({ email, password }),
})
```

现在换成请求业务后端：

```ts
await fetch('http://127.0.0.1:4000/auth/login', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ email, password }),
})
```

登录成功后保存：

```ts
const accessToken = result.data.accessToken
```

之后请求需要登录的接口：

```ts
await fetch('http://127.0.0.1:4000/users/me', {
  headers: {
    Authorization: `Bearer ${accessToken}`,
  },
})
```

Web 调试阶段可以先把 token 放内存或 `localStorage`。正式 Web 项目更建议用 HttpOnly Cookie。安卓端建议放系统安全存储。

## 常见坑

- 忘了设置 `API_AUTH_JWT_SECRET`：后端启动时会直接报错。
- 业务后端和音乐 API 的 JWT 配置不一致：登录成功了，但调用音乐 API 会提示 token 无效。
- 忘了写 `express.json()`：`req.body` 会是空的。当前 `index.js` 已经写了。
- 新建了 route 文件但没在 `index.js` 注册：接口会 404。
- 把业务代码写进根目录 `module/`：后续维护会变乱，也不方便和上游同步。
- 把网易云 cookie 当成业务 token：这是两套东西，不能互相替代。
- Supabase 邮件模板没展示 `{{ .Token }}`：用户收到的是链接，不是验证码。

## 当前已经有的接口

| 方法 | 路径 | 是否需要登录 | 说明 |
| --- | --- | --- | --- |
| `GET` | `/health` | 否 | 健康检查 |
| `POST` | `/auth/signup/code` | 否 | 发送注册邮箱验证码 |
| `POST` | `/auth/signup` | 否 | 验证邮箱验证码、设置密码、返回业务 JWT |
| `POST` | `/auth/login` | 否 | 邮箱密码登录、返回业务 JWT |
| `GET` | `/users/me` | 是 | 获取当前登录用户 |
