const config = require('./config')
const { createSupabaseAdminClient } = require('./lib/supabase')
const { createTogetherWsServer } = require('./ws/together-server')
const { TogetherRoomStore } = require('./ws/together-store')

async function main() {
  const supabaseAdmin = createSupabaseAdminClient(config)
  const store = new TogetherRoomStore({ supabaseAdmin })
  await store.loadPersistedRooms()

  const { server } = createTogetherWsServer(config, { store })

  server.listen(config.ws.port, config.ws.host, () => {
    console.log(
      `Together WebSocket server started at ws://${config.ws.host}:${config.ws.port}`,
    )
  })
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
