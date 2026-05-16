const express = require('express')
const { createSupabaseAdminClient } = require('../lib/supabase')
const { createAppAuthMiddleware } = require('../middleware/auth')
const { sendError, sendSuccess } = require('../util/response')
const { syncNcmLikelist, getLikelist } = require('../services/likelist')

function createLikelistRouter(config) {
  const requireAuth = createAppAuthMiddleware(config.jwt)
  const supabaseAdmin = createSupabaseAdminClient(config)
  const router = express.Router()

  router.post('/sync', requireAuth, async (req, res) => {
    const body = req.body || {}
    const userid = body.userid || null
    const likelist = body.likelist || []

    if (!userid) {
      sendError(res, 400, 'userid is required')
      return
    }
    if (!Array.isArray(likelist)) {
      sendError(res, 400, 'likelist must be an array')
      return
    }
    console.log(
      'Received sync request for userid:',
      userid,
      'with likelist:',
      likelist,
    )

    try {
      const result = await syncNcmLikelist(userid, supabaseAdmin, likelist)
      sendSuccess(res, {
        likelist: result,
      })
    } catch (error) {
      console.error('Error syncing like list:', error)
      sendError(res, 500, 'Internal server error')
    }
  })

  router.post('/', requireAuth, async (req, res) => {
    const body = req.body || {}
    const userid = body.userid || null

    if (!userid) {
      sendError(res, 400, 'userid is required')
      return
    }

    try {
      const result = await getLikelist(userid, supabaseAdmin)
      sendSuccess(res, {
        likelist: result,
      })
    } catch (error) {
      console.error('Error fetching like list:', error)
      sendError(
        res,
        error.status || 500,
        error.message || 'Internal server error',
      )
    }
  })

  return router
}

module.exports = {
  createLikelistRouter,
}
