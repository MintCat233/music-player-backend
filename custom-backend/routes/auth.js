const express = require('express')
const { signJwt } = require('../auth/jwt')
const {
  authenticateDemoUser,
  createSupabaseAuthClient,
  signInWithEmail,
  signUpWithEmail,
} = require('../services/users')

/**
 * @typedef {Object} AuthRequestBody
 * @property {string} email 用户邮箱。
 * @property {string} password 用户密码，最少 6 个字符。
 *
 * @typedef {Object} AuthUser
 * @property {string} id Supabase 用户 ID。
 * @property {string} email 用户邮箱。
 *
 * @typedef {Object} AuthTokenData
 * @property {string} accessToken 业务后端签发的 JWT，安卓调用音乐 API 时放到 Authorization Bearer。
 * @property {"Bearer"} tokenType Token 类型。
 * @property {number} expiresIn accessToken 有效期，单位秒。
 * @property {AuthUser} user 当前用户信息。
 *
 * @typedef {Object} AuthTokenResponse
 * @property {200|201} code 状态码。登录成功为 200，注册且无需邮箱验证时为 201。
 * @property {AuthTokenData} data
 *
 * @typedef {Object} SignupEmailConfirmationResponse
 * @property {202} code 状态码。表示 Supabase 已发送邮箱验证邮件。
 * @property {string} msg 固定为 "Email confirmation required"。
 * @property {{ email: string, emailConfirmationRequired: true }} data
 *
 * @typedef {Object} AuthErrorResponse
 * @property {number} code HTTP 状态码。
 * @property {string} msg 错误信息。
 */

function validateEmailPassword(req, res) {
  const { email, password } = req.body || {}

  if (!email || !password) {
    res.status(400).send({
      code: 400,
      msg: '邮箱或密码不能为空',
    })
    return null
  }

  if (typeof email !== 'string' || typeof password !== 'string') {
    res.status(400).send({
      code: 400,
      msg: '无效的邮箱或密码格式',
    })
    return null
  }

  if (!email.includes('@')) {
    res.status(400).send({
      code: 400,
      msg: '无效的邮箱格式',
    })
    return null
  }

  if (password.length < 6) {
    res.status(400).send({
      code: 400,
      msg: '密码必须在6个字符以上',
    })
    return null
  }

  return {
    email: email.trim().toLowerCase(),
    password,
  }
}

function createTokenResponse(user, config) {
  const accessToken = signJwt(
    {
      sub: user.id,
      email: user.email,
    },
    config.jwt,
  )

  return {
    accessToken,
    tokenType: 'Bearer',
    expiresIn: config.jwt.expiresInSeconds,
    user,
  }
}

function sendAuthError(res, error, fallbackStatus = 400) {
  const status = error.status || fallbackStatus

  res.status(status).send({
    code: status,
    msg: error.message || 'Auth failed',
  })
}

function createAuthRouter(config) {
  const router = express.Router()
  const supabase = createSupabaseAuthClient(config)

  /**
   * POST /auth/signup
   *
   * Request body:
   * @type {AuthRequestBody}
   *
   * Success responses:
   * - 202 {SignupEmailConfirmationResponse} Supabase 开启邮箱验证时返回，安卓应提示用户先去邮箱验证。
   * - 201 {AuthTokenResponse} Supabase 关闭邮箱验证时返回，安卓可直接保存 accessToken。
   *
   * Error response:
   * - 400/500 {AuthErrorResponse}
   */
  router.post('/signup', async (req, res) => {
    const credentials = validateEmailPassword(req, res)

    if (!credentials) {
      return
    }

    try {
      const result = await signUpWithEmail(credentials, supabase)
      const { emailConfirmationRequired, user } = result

      if (!user) {
        res.status(500).send({
          code: 500,
          msg: 'Supabase did not return a user',
        })
        return
      }

      if (emailConfirmationRequired) {
        res.status(202).send({
          code: 202,
          msg: 'Email confirmation required',
          data: {
            email: user.email,
            emailConfirmationRequired: true,
          },
        })
        return
      }

      res.status(201).send({
        code: 201,
        data: createTokenResponse(user, config),
      })
    } catch (error) {
      sendAuthError(res, error)
    }
  })

  /**
   * POST /auth/login
   *
   * Request body:
   * @type {AuthRequestBody}
   *
   * Success response:
   * - 200 {AuthTokenResponse} 安卓保存 data.accessToken，并用它调用音乐 API。
   *
   * Error response:
   * - 400/401 {AuthErrorResponse}
   */
  router.post('/login', async (req, res) => {
    const credentials = validateEmailPassword(req, res)

    if (!credentials) {
      return
    }

    try {
      let user = null

      if (supabase) {
        user = await signInWithEmail(credentials, supabase)
      } else {
        user = authenticateDemoUser(credentials, config.demoLogin)
      }

      if (!user) {
        res.status(401).send({
          code: 401,
          msg: 'Invalid email or password',
        })
        return
      }

      res.send({
        code: 200,
        data: createTokenResponse(user, config),
      })
    } catch (error) {
      sendAuthError(res, error, 401)
    }
  })

  return router
}

module.exports = {
  createAuthRouter,
}
