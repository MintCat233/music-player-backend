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
}
