const { verifyJwt } = require('../../util/auth')
const { sendError } = require('../util/response')

function createAppAuthMiddleware(jwtOptions) {
  return (req, res, next) => {
    const authorization = req.headers.authorization || ''
    const match = authorization.match(/^Bearer\s+(.+)$/i)

    if (!match) {
      sendError(res, 401, 'Unauthorized')
      return
    }

    try {
      req.user = verifyJwt(match[1], jwtOptions)
      next()
    } catch (_) {
      sendError(res, 401, 'Invalid token')
    }
  }
}

module.exports = {
  createAppAuthMiddleware,
}
