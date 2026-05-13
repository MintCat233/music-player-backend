const express = require('express')
const { createSupabaseAdminClient } = require('../lib/supabase')
const { createAppAuthMiddleware } = require('../middleware/auth')
const { getProfileRowByUserId } = require('../services/profiles')
const { sendError, sendSuccess } = require('../util/response')

function createMpProfileRouter(config) {
  const router = express.Router()
  const requireAuth = createAppAuthMiddleware(config.jwt)
  const supabaseAdmin = createSupabaseAdminClient(config)

  router.post('/', requireAuth, async (req, res) => {

    try {
      const row = await getProfileRowByUserId(req.userid, supabaseAdmin)

      sendSuccess(res, {
        id: row.user_id,
        email: req.email,
        username: row.username,
        avatar_url:row.avatar_url

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
