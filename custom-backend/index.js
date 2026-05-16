const express = require('express')
const config = require('./config')
const { createAuthRouter } = require('./routes/auth')
const { createMpProfileRouter } = require('./routes/profile')
const { sendSuccess } = require('./util/response')

function createApp() {
  const app = express()

  app.use(express.json())

  app.get('/health', (_, res) => {
    sendSuccess(res, {
      service: 'custom-backend',
    })
  })

  app.use('/auth', createAuthRouter(config))
  app.use('/profile/mp', createMpProfileRouter(config))
  app.use('/likelist', createLikelistRouter(config))

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
