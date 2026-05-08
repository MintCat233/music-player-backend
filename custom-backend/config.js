require('dotenv').config()

function getRequiredEnv(name) {
  const value = process.env[name]

  if (!value) {
    throw new Error(`${name} is required`)
  }

  return value
}

function getNumberEnv(name, fallback) {
  const value = process.env[name]

  if (!value) {
    return fallback
  }

  const parsed = Number(value)

  if (!Number.isFinite(parsed)) {
    throw new Error(`${name} must be a number`)
  }

  return parsed
}

module.exports = {
  port: getNumberEnv('APP_BACKEND_PORT', 4000),
  host: process.env.APP_BACKEND_HOST || '127.0.0.1',
  jwt: {
    secret: getRequiredEnv('API_AUTH_JWT_SECRET'),
    issuer: process.env.API_AUTH_JWT_ISSUER || 'app-backend',
    audience: process.env.API_AUTH_JWT_AUDIENCE || 'ncm-api',
    expiresInSeconds: getNumberEnv('APP_JWT_EXPIRES_IN_SECONDS', 60 * 60),
    refreshExpiresInSeconds: getNumberEnv(
      'APP_JWT_REFRESH_EXPIRES_IN_SECONDS',
      60 * 60 * 24 * 30,
    ),
  },
  supabase: {
    url: process.env.SUPABASE_URL,
    publishableKey:
      process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY,
  },
  demoLogin: {
    enabled: process.env.APP_ENABLE_DEMO_LOGIN === 'true',
    email: process.env.APP_DEMO_USER_EMAIL || 'demo@example.com',
    password: process.env.APP_DEMO_USER_PASSWORD || 'demo-password',
  },
}
