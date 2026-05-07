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

function normalizeSupabaseUser(user) {
  if (!user) {
    return null
  }

  return {
    id: user.id,
    email: user.email,
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

async function completeSignUpWithCode({ email, password, code }, supabase) {
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
    })

  if (updateError) {
    throw updateError
  }

  return normalizeSupabaseUser(updateData.user || data.user)
}

async function signInWithEmail({ email, password }, supabase) {
  assertSupabaseConfigured(supabase)

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  })

  if (error) {
    throw error
  }

  return normalizeSupabaseUser(data.user)
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
  }
}

module.exports = {
  authenticateDemoUser,
  completeSignUpWithCode,
  createSupabaseAuthClient,
  sendSignUpCode,
  signInWithEmail,
}
