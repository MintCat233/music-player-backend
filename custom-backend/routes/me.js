const express = require('express')
const { createAppAuthMiddleware } = require('../middleware/auth')
const { sendSuccess } = require('../util/response')

function createMeRouter(config) {
  const router = express.Router()
  const requireAuth = createAppAuthMiddleware(config.jwt)

  router.get('/me', requireAuth, (req, res) => {
    sendSuccess(res, {
      id: req.user.sub,
      email: req.user.email,
      username: req.user.username,
    })
  })

  return router
}

module.exports = {
  createMeRouter,
}
