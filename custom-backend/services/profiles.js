const { assertSupabaseConfigured } = require('../lib/supabase')

/**
 * 使用 service role 读取当前用户的 profile 行（业务 JWT 场景：用 sub 限定范围）。
 *
 * @param {string} userId Supabase user id，与 JWT payload.sub 一致
 * @param {import('@supabase/supabase-js').SupabaseClient} supabaseAdmin
 */
async function getProfileRowByUserId(userId, supabaseAdmin) {
  assertSupabaseConfigured(supabaseAdmin)

  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle()

  if (error) {
    throw error
  }

  return data
}

module.exports = {
  getProfileRowByUserId,
}
