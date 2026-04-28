# Custom Backend

这个目录放你自己的业务后端逻辑，例如登录、用户资料、会员状态、收藏同步、订单等。

原来的网易云 API 代码继续保留在项目根目录的 `server.js`、`module/`、`util/`、`plugins/` 里。以后尽量不要把你的业务登录代码写进那些文件，方便后续继续从原开源仓库同步更新。

## 当前职责划分

- `server.js` 和 `module/`：从原开源仓库 fork 二次开发来的网易云 API，只负责音乐接口。
- `util/auth.js`：音乐 API 的 JWT 校验工具，保护动态接口。
- `custom-backend/`：你自己的后端，负责登录并签发 JWT。

调用链是：

```text
App / Web
  -> POST custom-backend /auth/signup 或 /auth/login
  <- 拿到 accessToken
  -> 调用音乐 API 时带 Authorization: Bearer <accessToken>
```

## 本地启动

先设置环境变量：

```bash
API_AUTH_JWT_SECRET=test-secret
API_AUTH_JWT_ISSUER=app-backend
API_AUTH_JWT_AUDIENCE=ncm-api
APP_ENABLE_DEMO_LOGIN=false
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_PUBLISHABLE_KEY=sb_publishable_xxx
```

启动你的业务后端：

```bash
npm run app-backend
```

启动音乐 API，并打开鉴权：

```bash
API_AUTH_ENABLED=true API_AUTH_JWT_SECRET=test-secret API_AUTH_JWT_ISSUER=app-backend API_AUTH_JWT_AUDIENCE=ncm-api
 npm start
```

## Supabase 设置

在 Supabase Dashboard 里：

```text
Authentication -> Providers -> Email
```

打开 Email 登录。可以保留 `Confirm email` 开启：注册后 Supabase 会发送验证邮件，用户完成邮箱验证后，再调用 `/auth/login` 获取 `accessToken`。

## 注册接口

安卓调用：

```http
POST http://你的服务器:3510/auth/signup
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "12345678"
}
```

如果 Supabase 开启了邮箱验证，成功创建用户后返回：

```json
{
  "code": 202,
  "msg": "Email confirmation required",
  "data": {
    "email": "user@example.com",
    "emailConfirmationRequired": true
  }
}
```

安卓此时提示用户去邮箱完成验证，不要访问音乐 API。用户验证邮箱后，再调用 `/auth/login`。

如果 Supabase 关闭邮箱验证，注册接口会直接返回：

```json
{
  "code": 201,
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

安卓保存 `data.accessToken`。之后调用音乐 API：

```http
GET http://你的服务器:3500/cloudsearch?keywords=周杰伦&type=1
Authorization: Bearer <accessToken>
```

## 登录接口

```http
POST http://你的服务器:3510/auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "12345678"
}
```

返回：

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

然后调用音乐 API：

```http
GET http://你的服务器:3500/cloudsearch?keywords=周杰伦&type=1
Authorization: Bearer <accessToken>
```

## 下一步怎么开发

你有 Next + React 基础，可以按这个方式理解：

- React 页面里的 `fetch('/api/login')`，换成请求这个 `custom-backend` 的 `/auth/login`。
- 登录成功后，把 `accessToken` 存在 App 端安全存储里。Web 调试可以先放内存或 localStorage，正式 Web 更建议走 HttpOnly Cookie。
- 调音乐 API 时，每个请求都加 `Authorization: Bearer <accessToken>`。
- 网易云 cookie 仍然是网易云 cookie，不要塞进 JWT。它继续按原接口的 `cookie` 参数或 `Cookie` header 传。

现在 `services/users.js` 已经接入 Supabase。你后续写其他业务接口时，可以按这个模式：

- 路由文件只负责解析参数和返回 JSON。
- service 文件负责调用 Supabase 或数据库。
- 成功后如果要让安卓访问音乐 API，就调用 `signJwt()` 返回 `accessToken`。
- 音乐 API 不直接知道 Supabase，后续你换登录服务也不用改音乐 API。
