const express = require('express')
const config = require('./config')
const { createAuthRouter } = require('./routes/auth')
const { createMeRouter } = require('./routes/me')

function createApp() {
  const app = express()

  app.use(express.json())

  app.get('/health', (_, res) => {
    res.send({
      code: 200,
      status: 'ok',
      service: 'custom-backend',
    })
  })

  app.use('/auth', createAuthRouter(config))
  app.use('/users', createMeRouter(config))

  return app
}

if (require.main === module) {
  const app = createApp()

  app.listen(config.port, config.host, () => {
    console.log(
      `Custom backend started at http://${config.host}:${config.port}`,
    )
  })
}

module.exports = {
  createApp,
}
