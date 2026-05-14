const express = require('express')
const { signJwt } = require('../auth/jwt')
const { verifyJwt } = require('../../util/auth')
const {
  createSupabaseAdminClient,
  createSupabaseAuthClient,
} = require('../lib/supabase')
const {
  authenticateDemoUser,
  completeSignUpWithCode,
  sendSignUpCode,
  signInWithEmail,
  isUserRegistered,
  bindCookie,
  getCookie
} = require('../services/users')
const { sendError, sendSuccess } = require('../util/response')

/**
 * @typedef {Object} SignupCodeRequestBody
 * @property {string} email 用户邮箱。
 *
 * @typedef {Object} SignupRequestBody
 * @property {string} email 用户邮箱。
 * @property {string} password 用户密码，最少 6 个字符。
 * @property {string} username 用户名。
 * @property {string} code 邮箱验证码。
 *
 * @typedef {Object} LoginRequestBody
 * @property {string} email 用户邮箱。
 * @property {string} password 用户密码，最少 6 个字符。
 *
 * @typedef {Object} RefreshTokenRequestBody
 * @property {string} refreshToken 登录或注册接口返回的 refreshToken。
 *
 * @typedef {Object} AuthUser
 * @property {string} id Supabase 用户 ID。
 * @property {string} email 用户邮箱。
 * @property {string=} username 用户名。
 *
 * @typedef {Object} AuthTokenData
 * @property {string} accessToken 业务后端签发的 JWT，安卓调用音乐 API 时放到 Authorization Bearer。
 * @property {string} refreshToken 用于向业务后端换取新 accessToken 的 JWT，不要传给音乐 API。
 * @property {"Bearer"} tokenType Token 类型。
 * @property {number} expiresIn accessToken 有效期，单位秒。
 * @property {number} refreshExpiresIn refreshToken 有效期，单位秒。
 * @property {AuthUser} user 当前用户信息。
 *
 * @typedef {Object} AuthTokenResponse
 * @property {200} code 状态码。
 * @property {string} msg 成功信息。
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
 * @property {null} data 错误时固定为 null。
 */

function validateEmail(req, res) {
  const { email } = req.body || {}

  if (!email) {
    sendError(res, 400, '邮箱不能为空')
    return null
  }

  if (typeof email !== 'string') {
    sendError(res, 400, '无效的邮箱格式')
    return null
  }

  const formattedEmail = email.trim().toLowerCase()

  if (!formattedEmail || !formattedEmail.includes('@')) {
    sendError(res, 400, '无效的邮箱格式')
    return null
  }

  return {
    email: formattedEmail,
  }
}

function validatePassword(req, res) {
  const { password } = req.body || {}

  if (!password) {
    sendError(res, 400, '密码不能为空')
    return null
  }

  if (typeof password !== 'string') {
    sendError(res, 400, '无效的密码格式')
    return null
  }

  if (password.length < 6) {
    sendError(res, 400, '密码必须在6个字符以上')
    return null
  }

  return {
    password,
  }
}

function validateUsername(req, res) {
  const { username } = req.body || {}

  if (!username) {
    sendError(res, 400, '用户名不能为空')
    return null
  }

  if (typeof username !== 'string') {
    sendError(res, 400, '无效的用户名格式')
    return null
  }

  const formattedUsername = username.trim()

  if (!formattedUsername) {
    sendError(res, 400, '用户名不能为空')
    return null
  }

  return {
    username: formattedUsername,
  }
}

function validateCode(req, res) {
  const { code } = req.body || {}

  if (!code) {
    sendError(res, 400, '验证码不能为空')
    return null
  }

  if (typeof code !== 'string') {
    sendError(res, 400, '无效的验证码格式')
    return null
  }

  const formattedCode = code.trim()

  if (!formattedCode) {
    sendError(res, 400, '验证码不能为空')
    return null
  }

  return {
    code: formattedCode,
  }
}

function validateEmailPassword(req, res) {
  const email = validateEmail(req, res)
  if (!email) return null

  const password = validatePassword(req, res)
  if (!password) return null

  return {
    ...email,
    ...password,
  }
}

function validateRefreshToken(req, res) {
  const { refreshToken } = req.body || {}

  if (!refreshToken) {
    sendError(res, 400, 'refreshToken不能为空')
    return null
  }

  if (typeof refreshToken !== 'string') {
    sendError(res, 400, '无效的refreshToken格式')
    return null
  }

  return {
    refreshToken: refreshToken.trim(),
  }
}

function validateSignup(req, res) {
  const email = validateEmail(req, res)
  if (!email) return null

  const password = validatePassword(req, res)
  if (!password) return null

  const username = validateUsername(req, res)
  if (!username) return null

  const code = validateCode(req, res)
  if (!code) return null

  return {
    ...email,
    ...password,
    ...username,
    ...code,
  }
}

function createTokenResponse(user, config) {
  const accessToken = signJwt(
    {
      type: 'access',
      sub: user.id,
      email: user.email,
      username: user.username,
    },
    config.jwt,
  )
  const refreshToken = signJwt(
    {
      type: 'refresh',
      sub: user.id,
      email: user.email,
      username: user.username,
    },
    {
      ...config.jwt,
      expiresInSeconds: config.jwt.refreshExpiresInSeconds,
    },
  )

  return {
    accessToken,
    refreshToken,
    tokenType: 'Bearer',
    expiresIn: config.jwt.expiresInSeconds,
    refreshExpiresIn: config.jwt.refreshExpiresInSeconds,
    user,
  }
}

function createAccessTokenResponse(user, config) {
  const accessToken = signJwt(
    {
      type: 'access',
      sub: user.id,
      email: user.email,
      username: user.username,
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

  sendError(res, status, error.message || 'Auth failed')
}

function createAuthRouter(config) {
  const router = express.Router()
  const supabase = createSupabaseAuthClient(config)
  const supabaseAdmin = createSupabaseAdminClient(config)

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
      const isRegistered = await isUserRegistered(credentials.email, supabase)
      if (isRegistered) {
        sendError(res, 400, '该邮箱已被注册')
        return
      }
      const result = await sendSignUpCode(credentials, supabase)

      sendSuccess(
        res,
        {
          email: result.email,
        },
        'Verification code sent',
      )
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
   * - 200 {AuthTokenResponse} 验证码校验成功并设置密码后返回，安卓可直接保存 accessToken。
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
      const user = await completeSignUpWithCode(
        credentials,
        supabase,
        supabaseAdmin,
      )

      sendSuccess(res, createTokenResponse(user, config))
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

      const isRegistered = await isUserRegistered(credentials.email, supabase)
      if (!isRegistered ) {
        sendError(res, 400, '该邮箱未注册')
        return
      } 

      if (supabase) {
        user = await signInWithEmail(credentials, supabase, supabaseAdmin)
      } else {
        user = authenticateDemoUser(credentials, config.demoLogin)
      }

      if (!user) {
        sendError(res, 401, '无效的邮箱或密码')
        return
      }

      sendSuccess(res, createTokenResponse(user, config))
    } catch (error) {
      sendAuthError(res, error, 401)
    }
  })

  /**
   * POST /auth/refresh
   *
   * Request body:
   * @type {RefreshTokenRequestBody}
   *
   * Success response:
   * - 200 {AuthTokenResponse} refreshToken 有效时返回新的 accessToken。
   *
   * Error response:
   * - 400/401 {AuthErrorResponse}
   */
  router.post('/refresh', async (req, res) => {
    const credentials = validateRefreshToken(req, res)

    if (!credentials) {
      return
    }

    try {
      const payload = verifyJwt(credentials.refreshToken, config.jwt)

      if (payload.type !== 'refresh') {
        throw new Error('invalid token')
      }

      sendSuccess(
        res,
        createAccessTokenResponse(
          {
            id: payload.sub,
            email: payload.email,
            username: payload.username,
          },
          config,
        ),
      )
    } catch (_) {
      sendError(res, 401, 'Invalid refreshToken')
    }
  })

  router.post('/bind-cookie', async (req, res) => {
    const {cookie,userid}= req.body || {}

    if (!cookie || typeof cookie !== 'string') {
      sendError(res, 400, 'Cookie is required and must be a string')
      return
    }

    if (!userid || typeof userid !== 'string') {
      sendError(res, 400, 'User ID is required and must be a string')
      return
    }

    try {
      await bindCookie(cookie, userid, supabaseAdmin)
      sendSuccess(res, { message: 'Cookie绑定成功' })
    } catch (error) {
      sendError(res, error.status || 500, error.message || 'Cookie绑定失败')
    }
  })

  router.post('/cookie',async(req,res)=>{
    const {userid}= req.body || {}
    
    if (!userid || typeof userid !== 'string') {
      sendError(res, 400, 'User ID is required and must be a string')
      return
    }
    const response=await getCookie(userid, supabaseAdmin)

    if(response!==null){
      sendSuccess(res, { cookie: response })
    } else {
      sendError(res, 404, 'Cookie not found')
    }
  })

  return router
}

module.exports = {
  createAuthRouter,
}
