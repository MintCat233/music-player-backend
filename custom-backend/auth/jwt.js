const crypto = require('crypto')

function toBase64Url(input) {
  return Buffer.from(JSON.stringify(input))
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')
}

function signJwt(payload, options) {
  const now = Math.floor(Date.now() / 1000)
  const header = {
    alg: 'HS256',
    typ: 'JWT',
  }
  const claims = {
    iat: now,
    exp: now + options.expiresInSeconds,
    iss: options.issuer,
    aud: options.audience,
    ...payload,
  }
  const encodedHeader = toBase64Url(header)
  const encodedPayload = toBase64Url(claims)
  const signingInput = `${encodedHeader}.${encodedPayload}`
  const signature = crypto
    .createHmac('sha256', options.secret)
    .update(signingInput)
    .digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')

  return `${signingInput}.${signature}`
}

module.exports = {
  signJwt,
}
