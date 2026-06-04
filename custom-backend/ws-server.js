const config = require('./config')
const { createTogetherWsServer } = require('./ws/together-server')

const { server } = createTogetherWsServer(config)

server.listen(config.ws.port, config.ws.host, () => {
  console.log(
    `Together WebSocket server started at ws://${config.ws.host}:${config.ws.port}`,
  )
})
