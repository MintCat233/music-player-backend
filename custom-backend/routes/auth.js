const express = require('express')
const { signJwt } = require('../auth/jwt')
const { authenticateDemoUser } = require('../services/users')

function createAuthRouter(config) {
  const router = express.Router()

  router.post('/login', (req, res) => {
    const { email, password } = req.body || {}

    if (!email || !password) {
      res.status(400).send({
        code: 400,
        msg: 'email and password are required',
      })
      return
    }

    const user = authenticateDemoUser({ email, password }, config.demoLogin)

    if (!user) {
      res.status(401).send({
        code: 401,
        msg: 'Invalid email or password',
      })
      return
    }

    const accessToken = signJwt(
      {
        sub: user.id,
        email: user.email,
      },
      config.jwt,
    )

    res.send({
      code: 200,
      data: {
        accessToken,
        tokenType: 'Bearer',
        expiresIn: config.jwt.expiresInSeconds,
        user,
      },
    })
  })

  return router
}

module.exports = {
  createAuthRouter,
}
