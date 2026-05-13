const express = require('express')
const { createSupabaseAdminClient } = require('../lib/supabase')
const { createAppAuthMiddleware } = require('../middleware/auth')
const { getProfileRowByUserId } = require('../services/profiles')
const { sendError, sendSuccess } = require('../util/response')

function createMpProfileRouter(config) {
  const router = express.Router()
  const requireAuth = createAppAuthMiddleware(config.jwt)
  const supabaseAdmin = createSupabaseAdminClient(config)

  router.get('/', requireAuth, async (req, res) => {
    if (!supabaseAdmin) {
      sendSuccess(res, {
        id: req.user.sub,
        email: req.user.email,
        username: req.user.username,
        profile: null,
      })
      return
    }

    try {
      const row = await getProfileRowByUserId(req.user.sub, supabaseAdmin)

      sendSuccess(res, {
        id: req.user.sub,
        email: req.user.email,
        username: req.user.username,
        profile: row,
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
