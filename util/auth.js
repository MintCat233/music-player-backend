const crypto = require('crypto')

function base64UrlDecode(input) {
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/')
  const paddingLength = (4 - (normalized.length % 4)) % 4
  return Buffer.from(normalized + '='.repeat(paddingLength), 'base64')
}

function safeJsonParse(buffer) {
  try {
    return JSON.parse(buffer.toString('utf8'))
  } catch (_) {
    return null
  }
}

function signHS256(input, secret) {
  return crypto.createHmac('sha256', secret).update(input).digest('base64')
}

function toBase64Url(base64) {
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function safeEqual(a, b) {
  const aBuffer = Buffer.from(a)
  const bBuffer = Buffer.from(b)

  if (aBuffer.length !== bBuffer.length) {
    return false
  }

  return crypto.timingSafeEqual(aBuffer, bBuffer)
}

function audienceMatches(expected, actual) {
  if (Array.isArray(actual)) {
    return actual.includes(expected)
  }

  return actual === expected
}

/**
 * Verify an HS256 JWT and return its payload.
 *
 * @param {string} token
 * @param {{
 *   secret: string,
 *   issuer?: string,
 *   audience?: string,
 *   now?: number,
 * }} options
 * @returns {Record<string, any>}
 */
function verifyJwt(token, options) {
  if (!token || typeof token !== 'string') {
    throw new Error('missing token')
  }

  const parts = token.split('.')
  if (parts.length !== 3 || parts.some((part) => !part)) {
    throw new Error('invalid token')
  }

  const [encodedHeader, encodedPayload, signature] = parts
  const header = safeJsonParse(base64UrlDecode(encodedHeader))
  const payload = safeJsonParse(base64UrlDecode(encodedPayload))

  if (!header || !payload || header.alg !== 'HS256') {
    throw new Error('invalid token')
  }

  const signedInput = `${encodedHeader}.${encodedPayload}`
  const expectedSignature = toBase64Url(signHS256(signedInput, options.secret))

  if (!safeEqual(signature, expectedSignature)) {
    throw new Error('invalid token')
  }

  const now = options.now || Math.floor(Date.now() / 1000)
  if (typeof payload.exp !== 'number' || payload.exp <= now) {
    throw new Error('invalid token')
  }

  if (options.issuer && payload.iss !== options.issuer) {
    throw new Error('invalid token')
  }

  if (options.audience && !audienceMatches(options.audience, payload.aud)) {
    throw new Error('invalid token')
  }

  return payload
}

function createAuthMiddleware(options) {
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
      req.auth = verifyJwt(match[1], options)
      if (req.auth.type && req.auth.type !== 'access') {
        throw new Error('invalid token')
      }
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
  createAuthMiddleware,
  verifyJwt,
}
