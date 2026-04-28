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
  -> POST custom-backend /auth/login
  <- 拿到 accessToken
  -> 调用音乐 API 时带 Authorization: Bearer <accessToken>
```

## 本地启动

先设置环境变量：

```bash
API_AUTH_JWT_SECRET=test-secret
API_AUTH_JWT_ISSUER=app-backend
API_AUTH_JWT_AUDIENCE=ncm-api
APP_ENABLE_DEMO_LOGIN=true
APP_DEMO_USER_EMAIL=demo@example.com
APP_DEMO_USER_PASSWORD=demo-password
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

## 登录接口

```http
POST http://127.0.0.1:4000/auth/login
Content-Type: application/json

{
  "email": "demo@example.com",
  "password": "demo-password"
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
      "id": "demo-user",
      "email": "demo@example.com"
    }
  }
}
```

然后调用音乐 API：

```http
GET http://localhost:3000/cloudsearch?keywords=周杰伦&type=1
Authorization: Bearer <accessToken>
```

## 下一步怎么开发

你有 Next + React 基础，可以按这个方式理解：

- React 页面里的 `fetch('/api/login')`，换成请求这个 `custom-backend` 的 `/auth/login`。
- 登录成功后，把 `accessToken` 存在 App 端安全存储里。Web 调试可以先放内存或 localStorage，正式 Web 更建议走 HttpOnly Cookie。
- 调音乐 API 时，每个请求都加 `Authorization: Bearer <accessToken>`。
- 网易云 cookie 仍然是网易云 cookie，不要塞进 JWT。它继续按原接口的 `cookie` 参数或 `Cookie` header 传。

真正接入用户系统时，主要替换 `services/users.js`：

- 现在是演示账号校验。
- 后续你可以换成数据库查询，比如 MySQL、PostgreSQL、MongoDB。
- 密码不要明文存储，生产环境用 `bcrypt` 或 `argon2` 存哈希。
- 登录成功后仍然调用 `signJwt()` 签发 token，音乐 API 不需要知道你的数据库。
