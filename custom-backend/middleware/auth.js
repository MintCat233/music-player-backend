const { verifyJwt } = require('../../util/auth')

function createAppAuthMiddleware(jwtOptions) {
  return (req, res, next) => {
    const authorization = req.headers.authorization || ''
    const match = authorization.match(/^Bearer\s+(.+)$/i)

    if (!match) {
      res.status(401).send({
        code: 401,
        msg: 'Unauthorized',
      })
      return
    }

    try {
      req.user = verifyJwt(match[1], jwtOptions)
      next()
    } catch (_) {
      res.status(401).send({
        code: 401,
        msg: 'Invalid token',
      })
    }
  }
}

module.exports = {
  createAppAuthMiddleware,
}
