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

async function signUpWithEmail({ email, password }, supabase) {
  assertSupabaseConfigured(supabase)

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
  })

  if (error) {
    throw error
  }

  return {
    user: normalizeSupabaseUser(data.user),
    emailConfirmationRequired: !data.session,
  }
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
  createSupabaseAuthClient,
  signInWithEmail,
  signUpWithEmail,
}
