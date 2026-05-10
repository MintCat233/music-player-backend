const { createClient } = require('@supabase/supabase-js')

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

function normalizeSupabaseUser(user) {
  if (!user) {
    return null
  }

  return {
    id: user.id,
    email: user.email,
    username: user.user_metadata && user.user_metadata.username,
  }
}

function assertSupabaseConfigured(supabase) {
  if (!supabase) {
    const error = new Error('Supabase is not configured')
    error.status = 500
    throw error
  }
}

async function sendSignUpCode({ email }, supabase) {
  assertSupabaseConfigured(supabase)

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: true,
    },
  })

  if (error) {
    throw error
  }

  return {
    email,
  }
}

async function completeSignUpWithCode(
  { email, password, username, code },
  supabase,
  supabaseAdmin,
) {
  assertSupabaseConfigured(supabase)

  const { data, error } = await supabase.auth.verifyOtp({
    email,
    token: code,
    type: 'email',
  })

  if (error) {
    throw error
  }

  if (!data.session) {
    const sessionError = new Error('Invalid or expired verification code')
    sessionError.status = 400
    throw sessionError
  }

  await supabase.auth.setSession({
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
  })

  const { data: updateData, error: updateError } =
    await supabase.auth.updateUser({
      password,
      data: {
        username,
      },
    })

  if (updateError) {
    throw updateError
  }

  const { data: profileData, error: profileError } = await supabaseAdmin
    .from('profiles')
    .upsert({
      user_id: data.user.id,
      username,
      email,
      is_binding: false
    })

  if (profileError) {
    throw profileError
  }



  return normalizeSupabaseUser(updateData.user || data.user)
}

async function signInWithEmail({ email, password }, supabase, supabaseAdmin) {
  assertSupabaseConfigured(supabase)

  if (supabaseAdmin) {
    // TODO: 在这里填登录成功后需要 admin 权限的逻辑。
    // 例如查询/更新只允许 service role 访问的用户扩展资料。
  }

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  })

  if (error) {
    throw error
  }


  return normalizeSupabaseUser(data.user)
}

async function isUserRegistered(email,supabase){
  assertSupabaseConfigured(supabase)
  
  const { data, error } = await supabase.from('profiles')
    .select('user_id')
    .eq('email', email)
    .maybeSingle()

  if (error) {
    throw error
  }

  return !!data
}

function authenticateDemoUser({ email, password }, demoLogin) {
  if (!demoLogin.enabled) {
    return null
  }

  if (email !== demoLogin.email || password !== demoLogin.password) {
    return null
  }

  return {
    id: 'demo-user',
    email,
    username: 'demo',
  }
}

module.exports = {
  authenticateDemoUser,
  completeSignUpWithCode,
  createSupabaseAdminClient,
  createSupabaseAuthClient,
  sendSignUpCode,
  signInWithEmail,
  isUserRegistered
}
