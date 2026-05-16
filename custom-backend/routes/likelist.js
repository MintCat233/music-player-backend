function createLikelistRouter(config) {
  const requireAuth = createAppAuthMiddleware(config.jwt)
  const supabaseAdmin = createSupabaseAdminClient(config)
  const router = express.Router()

  router.get('/sync', async (req, res) => {
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
    const result = await syncNcmLikelist(userid, supabaseAdmin, likelist)
    sendSuccess(res, {
      likelist: result,
    })
  })

  return router
}

module.exports = {
  createLikelistRouter,
}
