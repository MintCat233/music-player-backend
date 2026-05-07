const express = require('express')
const { signJwt } = require('../auth/jwt')
const {
  authenticateDemoUser,
  completeSignUpWithCode,
  createSupabaseAuthClient,
  sendSignUpCode,
  signInWithEmail,
} = require('../services/users')

/**
 * @typedef {Object} SignupCodeRequestBody
 * @property {string} email 用户邮箱。
 *
 * @typedef {Object} SignupRequestBody
 * @property {string} email 用户邮箱。
 * @property {string} password 用户密码，最少 6 个字符。
 * @property {string} code 邮箱验证码。
 *
 * @typedef {Object} LoginRequestBody
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
 * @property {200|201} code 状态码。登录成功为 200，注册成功为 201。
 * @property {AuthTokenData} data
 *
 * @typedef {Object} SignupCodeResponse
 * @property {200} code 状态码。表示 Supabase 已发送邮箱验证码。
 * @property {string} msg 固定为 "Verification code sent"。
 * @property {{ email: string }} data
 *
 * @typedef {Object} AuthErrorResponse
 * @property {number} code HTTP 状态码。
 * @property {string} msg 错误信息。
 */

function validateEmail(req, res) {
  const { email } = req.body || {}

  if (!email) {
    res.status(400).send({
      code: 400,
      msg: '邮箱不能为空',
    })
    return null
  }

  if (typeof email !== 'string') {
    res.status(400).send({
      code: 400,
      msg: '无效的邮箱格式',
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

  return {
    email: email.trim().toLowerCase(),
  }
}

function validateEmailPassword(req, res) {
  const emailResult = validateEmail(req, res)

  if (!emailResult) {
    return null
  }

  const { password } = req.body || {}

  if (!password) {
    res.status(400).send({
      code: 400,
      msg: '密码不能为空',
    })
    return null
  }

  if (typeof password !== 'string') {
    res.status(400).send({
      code: 400,
      msg: '无效的密码格式',
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
    email: emailResult.email,
    password,
  }
}

function validateSignup(req, res) {
  const credentials = validateEmailPassword(req, res)

  if (!credentials) {
    return null
  }

  const { code } = req.body || {}

  if (!code) {
    res.status(400).send({
      code: 400,
      msg: '验证码不能为空',
    })
    return null
  }

  if (typeof code !== 'string') {
    res.status(400).send({
      code: 400,
      msg: '无效的验证码格式',
    })
    return null
  }

  return {
    ...credentials,
    code: code.trim(),
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
   * POST /auth/signup/code
   *
   * Request body:
   * @type {SignupCodeRequestBody}
   *
   * Success response:
   * - 200 {SignupCodeResponse} Supabase 已发送邮箱验证码。
   *
   * Error response:
   * - 400/500 {AuthErrorResponse}
   */
  router.post('/signup/code', async (req, res) => {
    const credentials = validateEmail(req, res)

    if (!credentials) {
      return
    }

    try {
      const result = await sendSignUpCode(credentials, supabase)

      res.send({
        code: 200,
        msg: 'Verification code sent',
        data: {
          email: result.email,
        },
      })
    } catch (error) {
      sendAuthError(res, error)
    }
  })

  /**
   * POST /auth/signup
   *
   * Request body:
   * @type {SignupRequestBody}
   *
   * Success response:
   * - 201 {AuthTokenResponse} 验证码校验成功并设置密码后返回，安卓可直接保存 accessToken。
   *
   * Error response:
   * - 400/500 {AuthErrorResponse}
   */
  router.post('/signup', async (req, res) => {
    const credentials = validateSignup(req, res)

    if (!credentials) {
      return
    }

    try {
      const user = await completeSignUpWithCode(credentials, supabase)

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
   * @type {LoginRequestBody}
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
