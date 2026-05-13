const express = require('express')
const { createSupabaseAdminClient } = require('../lib/supabase')
const { createAppAuthMiddleware } = require('../middleware/auth')
const { getProfileRowByUserId } = require('../services/profiles')
const { sendError, sendSuccess } = require('../util/response')

function createMpProfileRouter(config) {
  const router = express.Router()
  const requireAuth = createAppAuthMiddleware(config.jwt)
  const supabaseAdmin = createSupabaseAdminClient(config)

  /**
   * POST /profile/mp
   * Header: Authorization: Bearer <业务 accessToken>
   * Body（可选）: { "userid": "<与 token sub 一致的 uuid>" }，若填写则必须与 JWT 一致，否则 403。
   * 实际查询使用的用户 id 始终来自 JWT 的 sub，不会单独信任 body。
   */
  router.post('/', requireAuth, async (req, res) => {
    const userId = req.user.sub
    const bodyUserId =
      req.body && typeof req.body.userid === 'string'
        ? req.body.userid.trim()
        : ''

    if (bodyUserId && bodyUserId !== userId) {
      sendError(res, 403, 'userid does not match token')
      return
    }

    if (!supabaseAdmin) {
      sendSuccess(res, {
        id: userId,
        email: req.user.email,
        username: req.user.username,
        avatar_url: null,
      })
      return
    }

    try {
      const row = await getProfileRowByUserId(userId, supabaseAdmin)

      sendSuccess(res, {
        id: userId,
        email: req.user.email,
        username: row && row.username != null ? row.username : req.user.username,
        avatar_url: row && row.avatar_url != null ? row.avatar_url : null,
      })
    } catch (error) {
      sendError(res, error.status || 500, error.message || 'Profile query failed')
    }
  })

  return router
}

module.exports = {
  createMpProfileRouter,
}
