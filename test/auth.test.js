const assert = require('assert')
const crypto = require('crypto')
const { once } = require('events')
const fs = require('fs')
const path = require('path')
const tmpPath = require('os').tmpdir()
const { default: axios } = require('axios')

if (!fs.existsSync(path.resolve(tmpPath, 'anonymous_token'))) {
  fs.writeFileSync(path.resolve(tmpPath, 'anonymous_token'), '', 'utf-8')
}

const serverMod = require('../server')

const authModuleDefs = [
  {
    identifier: 'auth_mock',
    route: '/auth/mock',
    module: async () => ({
      status: 200,
      body: {
        code: 200,
        msg: 'ok',
      },
    }),
  },
]

function base64Url(input) {
  return Buffer.from(JSON.stringify(input))
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')
}

function signToken(payload, secret, header = { alg: 'HS256', typ: 'JWT' }) {
  const encodedHeader = base64Url(header)
  const encodedPayload = base64Url(payload)
  const signingInput = `${encodedHeader}.${encodedPayload}`
  const signature = crypto
    .createHmac('sha256', secret)
    .update(signingInput)
    .digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')

  return `${signingInput}.${signature}`
}

function validPayload(overrides = {}) {
  return {
    exp: Math.floor(Date.now() / 1000) + 60,
    sub: 'user-1',
    ...overrides,
  }
}

async function startServer(env) {
  const oldEnv = { ...process.env }
  Object.assign(process.env, env)

  try {
    const app = await serverMod.serveNcmApi({
      port: 0,
      host: '127.0.0.1',
      moduleDefs: authModuleDefs,
    })
    if (!app.server.address()) {
      await once(app.server, 'listening')
    }

    const addr = app.server.address()
    const host = `http://localhost:${addr.port}`

    return {
      app,
      host,
      close: () =>
        new Promise((resolve, reject) => {
          app.server.close((err) => {
            if (err) reject(err)
            else resolve()
          })
        }),
    }
  } finally {
    process.env = oldEnv
  }
}

async function get(url, config = {}) {
  return axios.get(url, {
    validateStatus: () => true,
    ...config,
  })
}

describe('JWT auth middleware', () => {
  it('allows dynamic API access when API_AUTH_ENABLED is false', async () => {
    const server = await startServer({
      API_AUTH_ENABLED: 'false',
      API_AUTH_JWT_SECRET: '',
    })

    try {
      const response = await get(`${server.host}/auth/mock`)

      assert.strictEqual(response.status, 200)
      assert.strictEqual(response.data.code, 200)
    } finally {
      await server.close()
    }
  })

  it('fails startup when auth is enabled without a secret', async () => {
    const oldEnv = { ...process.env }
    process.env.API_AUTH_ENABLED = 'true'
    delete process.env.API_AUTH_JWT_SECRET

    try {
      await assert.rejects(
        () =>
          serverMod.serveNcmApi({
            port: 0,
            host: '127.0.0.1',
            moduleDefs: authModuleDefs,
          }),
        /API_AUTH_JWT_SECRET is required/,
      )
    } finally {
      process.env = oldEnv
    }
  })

  it('returns 401 when Authorization is missing', async () => {
    const server = await startServer({
      API_AUTH_ENABLED: 'true',
      API_AUTH_JWT_SECRET: 'test-secret',
    })

    try {
      const response = await get(`${server.host}/auth/mock`)

      assert.strictEqual(response.status, 401)
      assert.deepStrictEqual(response.data, {
        code: 401,
        msg: 'Unauthorized',
      })
    } finally {
      await server.close()
    }
  })

  it('returns 401 for invalid or expired tokens', async () => {
    const server = await startServer({
      API_AUTH_ENABLED: 'true',
      API_AUTH_JWT_SECRET: 'test-secret',
    })

    try {
      const wrongSignatureToken = signToken(validPayload(), 'wrong-secret')
      const expiredToken = signToken(
        validPayload({ exp: Math.floor(Date.now() / 1000) - 1 }),
        'test-secret',
      )

      for (const token of [wrongSignatureToken, expiredToken]) {
        const response = await get(`${server.host}/auth/mock`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        })

        assert.strictEqual(response.status, 401)
        assert.deepStrictEqual(response.data, {
          code: 401,
          msg: 'Invalid token',
        })
      }
    } finally {
      await server.close()
    }
  })

  it('returns 401 when issuer or audience does not match', async () => {
    const server = await startServer({
      API_AUTH_ENABLED: 'true',
      API_AUTH_JWT_SECRET: 'test-secret',
      API_AUTH_JWT_ISSUER: 'app-backend',
      API_AUTH_JWT_AUDIENCE: 'ncm-api',
    })

    try {
      const wrongIssuerToken = signToken(
        validPayload({ iss: 'other-backend', aud: 'ncm-api' }),
        'test-secret',
      )
      const wrongAudienceToken = signToken(
        validPayload({ iss: 'app-backend', aud: 'other-api' }),
        'test-secret',
      )

      for (const token of [wrongIssuerToken, wrongAudienceToken]) {
        const response = await get(`${server.host}/auth/mock`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        })

        assert.strictEqual(response.status, 401)
        assert.strictEqual(response.data.msg, 'Invalid token')
      }
    } finally {
      await server.close()
    }
  })

  it('allows dynamic API access with a valid token', async () => {
    const server = await startServer({
      API_AUTH_ENABLED: 'true',
      API_AUTH_JWT_SECRET: 'test-secret',
      API_AUTH_JWT_ISSUER: 'app-backend',
      API_AUTH_JWT_AUDIENCE: 'ncm-api',
    })

    try {
      const token = signToken(
        validPayload({ iss: 'app-backend', aud: ['ncm-api'] }),
        'test-secret',
      )
      const response = await get(`${server.host}/auth/mock`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })

      assert.strictEqual(response.status, 200)
      assert.strictEqual(response.data.msg, 'ok')
    } finally {
      await server.close()
    }
  })

  it('does not require JWT for OPTIONS, static files, or health checks', async () => {
    const server = await startServer({
      API_AUTH_ENABLED: 'true',
      API_AUTH_JWT_SECRET: 'test-secret',
    })

    try {
      const optionsResponse = await axios.options(`${server.host}/auth/mock`, {
        validateStatus: () => true,
      })
      const staticResponse = await get(`${server.host}/index.html`)
      const healthResponse = await get(`${server.host}/health`)

      assert.strictEqual(optionsResponse.status, 204)
      assert.match(
        optionsResponse.headers['access-control-allow-headers'],
        /Authorization/,
      )
      assert.strictEqual(staticResponse.status, 200)
      assert.strictEqual(healthResponse.status, 200)
      assert.deepStrictEqual(healthResponse.data, {
        code: 200,
        status: 'ok',
      })
    } finally {
      await server.close()
    }
  })
})
