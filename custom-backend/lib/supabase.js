const { createClient } = require('@supabase/supabase-js')

/**
 * 校验 Supabase 客户端是否已创建（环境变量齐全）。
 * @param {import('@supabase/supabase-js').SupabaseClient | null | undefined} client
 */
function assertSupabaseConfigured(client) {
  if (!client) {
    const error = new Error('Supabase is not configured')
    error.status = 500
    throw error
  }
}

/**
 * 匿名 / publishable key 客户端：用于服务端发起 OTP、密码登录等 Auth 流程。
 * 不持久化会话。
 *
 * @param {typeof import('../config')} config
 */
function createSupabaseAuthClient(config) {
  if (!config.supabase.url || !config.supabase.publishableKey) {
    return null
  }

  return createClient(config.supabase.url, config.supabase.publishableKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  })
}

/**
 * Service role 客户端：仅用于可信后端；绕过 RLS，查询时必须自行按 user_id 等约束范围。
 *
 * @param {typeof import('../config')} config
 */
function createSupabaseAdminClient(config) {
  if (!config.supabase.url || !config.supabase.serviceRoleKey) {
    return null
  }

  return createClient(config.supabase.url, config.supabase.serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  })
}

module.exports = {
  assertSupabaseConfigured,
  createSupabaseAdminClient,
  createSupabaseAuthClient,
}
