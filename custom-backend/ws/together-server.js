const crypto = require('crypto')
const http = require('http')
const { URL } = require('url')
const { WebSocket, WebSocketServer } = require('ws')
const { verifyJwt } = require('../../util/auth')
const { TogetherRoomStore, createUserFromClaims } = require('./together-store')

function safeJsonParse(raw) {
  try {
    return JSON.parse(raw)
  } catch (_) {
    return null
  }
}

function send(ws, message) {
  if (ws.readyState !== WebSocket.OPEN) {
    return
  }
  ws.send(JSON.stringify(message))
}

function sendError(ws, requestId, message, code = 400) {
  send(ws, {
    type: 'error',
    requestId: requestId || null,
    code,
    msg: message,
    message,
  })
}

function getBearerToken(req) {
  const url = new URL(
    req.url || '/',
    `http://${req.headers.host || 'localhost'}`,
  )
  const queryToken =
    url.searchParams.get('token') || url.searchParams.get('access_token')

  if (queryToken) {
    return queryToken.replace(/^Bearer\s+/i, '').trim()
  }

  const authorization = req.headers.authorization || ''
  const match = authorization.match(/^Bearer\s+(.+)$/i)
  if (match) {
    return match[1].trim()
  }

  return null
}

function authenticateRequest(req, jwtOptions) {
  const token = getBearerToken(req)
  const claims = verifyJwt(token, jwtOptions)

  if (claims.type && claims.type !== 'access') {
    throw new Error('invalid token')
  }

  return {
    claims,
    user: createUserFromClaims(claims),
  }
}

function createTogetherWsServer(config, options = {}) {
  const store = options.store || new TogetherRoomStore()
  const sessions = new Map()
  const server = http.createServer((req, res) => {
    if (req.url === '/health') {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(
        JSON.stringify({
          code: 200,
          msg: 'success',
          data: {
            service: 'together-ws',
            rooms: store.rooms.size,
            clients: sessions.size,
          },
        }),
      )
      return
    }

    res.writeHead(404, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ code: 404, msg: 'Not Found', data: null }))
  })
  const wss = new WebSocketServer({ noServer: true })

  function sendRoomsSnapshot(session) {
    send(session.ws, {
      type: 'rooms.snapshot',
      payload: {
        rooms: store.listRoomsForUser(session.user.id),
        currentRoomId: session.currentRoomId,
      },
    })
  }

  function broadcastRoomsSnapshot() {
    sessions.forEach(sendRoomsSnapshot)
  }

  function sendRoomSnapshot(session, room) {
    send(session.ws, {
      type: 'room.snapshot',
      payload: {
        room: store.serializeRoom(room, session.user.id),
      },
    })
  }

  function broadcastRoomSnapshot(room) {
    sessions.forEach((session) => {
      if (session.currentRoomId === room.id) {
        sendRoomSnapshot(session, room)
      }
    })
  }

  function broadcastAll(room) {
    if (room) {
      broadcastRoomSnapshot(room)
    }
    broadcastRoomsSnapshot()
  }

  function leaveCurrentRoom(session) {
    if (!session.currentRoomId) {
      return null
    }

    const room = store.leaveRoom(
      session.currentRoomId,
      session.user.id,
      session.id,
    )
    session.currentRoomId = null
    return room
  }

  function requireJoinedRoom(session, payload) {
    const roomId = payload?.roomId || session.currentRoomId
    if (!roomId) {
      const error = new Error('请先加入房间')
      error.status = 400
      throw error
    }
    return roomId
  }

  function handleMessage(session, raw) {
    const message = safeJsonParse(raw)

    if (!message || typeof message !== 'object') {
      sendError(session.ws, null, '无效的消息格式')
      return
    }

    const { type, requestId, payload = {} } = message

    try {
      switch (type) {
        case 'ping': {
          send(session.ws, {
            type: 'pong',
            requestId: requestId || null,
            payload: {
              now: Date.now(),
            },
          })
          break
        }

        case 'rooms.list': {
          sendRoomsSnapshot(session)
          break
        }

        case 'room.create': {
          const previousRoom = leaveCurrentRoom(session)
          const room = store.createRoom(payload, session.user)
          store.joinRoom(room.id, session.user, session.id, payload.password)
          session.currentRoomId = room.id
          send(session.ws, {
            type: 'room.created',
            requestId: requestId || null,
            payload: {
              room: store.serializeRoom(room, session.user.id),
            },
          })
          if (previousRoom) {
            broadcastRoomSnapshot(previousRoom)
          }
          broadcastAll(room)
          break
        }

        case 'room.join': {
          const previousRoom = leaveCurrentRoom(session)
          const room = store.joinRoom(
            payload.roomId,
            session.user,
            session.id,
            payload.password,
          )
          session.currentRoomId = room.id
          send(session.ws, {
            type: 'room.joined',
            requestId: requestId || null,
            payload: {
              room: store.serializeRoom(room, session.user.id),
            },
          })
          if (previousRoom && previousRoom.id !== room.id) {
            broadcastRoomSnapshot(previousRoom)
          }
          broadcastAll(room)
          break
        }

        case 'room.leave': {
          const room = leaveCurrentRoom(session)
          send(session.ws, {
            type: 'room.left',
            requestId: requestId || null,
            payload: {
              roomId: room?.id || null,
            },
          })
          broadcastAll(room)
          break
        }

        case 'room.delete': {
          const roomId = payload.roomId || session.currentRoomId
          const room = store.deleteRoom(roomId, session.user)
          sessions.forEach((candidate) => {
            if (candidate.currentRoomId === room.id) {
              candidate.currentRoomId = null
              send(candidate.ws, {
                type: 'room.deleted',
                payload: {
                  roomId: room.id,
                },
              })
            }
          })
          broadcastRoomsSnapshot()
          break
        }

        case 'queue.add': {
          const roomId = requireJoinedRoom(session, payload)
          const room = store.addSong(roomId, payload.song)
          send(session.ws, {
            type: 'queue.added',
            requestId: requestId || null,
            payload: {
              room: store.serializeRoom(room, session.user.id),
            },
          })
          broadcastAll(room)
          break
        }

        case 'queue.playNext': {
          const roomId = requireJoinedRoom(session, payload)
          const room = store.playNext(roomId, session.user, payload)
          send(session.ws, {
            type: 'queue.playNext.updated',
            requestId: requestId || null,
            payload: {
              room: store.serializeRoom(room, session.user.id),
            },
          })
          broadcastAll(room)
          break
        }

        case 'queue.remove': {
          const roomId = requireJoinedRoom(session, payload)
          const room = store.removeSong(roomId, session.user, payload.songId)
          send(session.ws, {
            type: 'queue.removed',
            requestId: requestId || null,
            payload: {
              room: store.serializeRoom(room, session.user.id),
            },
          })
          broadcastAll(room)
          break
        }

        case 'playback.set': {
          const roomId = requireJoinedRoom(session, payload)
          const room = store.setPlayback(roomId, session.user, payload)
          send(session.ws, {
            type: 'playback.updated',
            requestId: requestId || null,
            payload: {
              room: store.serializeRoom(room, session.user.id),
            },
          })
          broadcastAll(room)
          break
        }

        default:
          sendError(session.ws, requestId, `未知消息类型: ${type}`, 400)
      }
    } catch (error) {
      sendError(
        session.ws,
        requestId,
        error.message || '操作失败',
        error.status || 500,
      )
    }
  }

  server.on('upgrade', (req, socket, head) => {
    let auth
    try {
      auth = authenticateRequest(req, config.jwt)
    } catch (_) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n')
      socket.destroy()
      return
    }

    wss.handleUpgrade(req, socket, head, (ws) => {
      ws.auth = auth
      wss.emit('connection', ws, req)
    })
  })

  wss.on('connection', (ws) => {
    const session = {
      id: crypto.randomUUID(),
      ws,
      user: ws.auth.user,
      currentRoomId: null,
      isAlive: true,
    }
    sessions.set(session.id, session)

    send(ws, {
      type: 'hello',
      payload: {
        user: session.user,
      },
    })
    sendRoomsSnapshot(session)

    ws.on('pong', () => {
      session.isAlive = true
    })

    ws.on('message', (raw) => {
      handleMessage(session, raw.toString('utf8'))
    })

    ws.on('close', () => {
      const room = leaveCurrentRoom(session)
      sessions.delete(session.id)
      broadcastAll(room)
    })
  })

  const heartbeat = setInterval(() => {
    sessions.forEach((session) => {
      if (!session.isAlive) {
        session.ws.terminate()
        return
      }

      session.isAlive = false
      session.ws.ping()
    })
  }, config.ws.heartbeatIntervalMs)

  server.on('close', () => {
    clearInterval(heartbeat)
  })

  return {
    server,
    wss,
    store,
    sessions,
  }
}

module.exports = {
  createTogetherWsServer,
}
