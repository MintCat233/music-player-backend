const express = require('express')
const { createAppAuthMiddleware } = require('../middleware/auth')

function createMeRouter(config) {
  const router = express.Router()
  const requireAuth = createAppAuthMiddleware(config.jwt)

  router.get('/me', requireAuth, (req, res) => {
    res.send({
      code: 200,
      data: {
        id: req.user.sub,
        email: req.user.email,
        username: req.user.username,
      },
    })
  })

  return router
}

module.exports = {
  createMeRouter,
}
