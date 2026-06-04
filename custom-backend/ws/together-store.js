const crypto = require('crypto')

function normalizeText(value) {
  return String(value || '').trim()
}

function createPasswordHash(password) {
  return crypto.createHash('sha256').update(String(password)).digest('hex')
}

function createRoomId() {
  return `room-${crypto.randomInt(100000, 999999)}`
}

function normalizeSong(song) {
  if (!song || typeof song !== 'object') {
    return null
  }

  const id = normalizeText(song.id)
  const name = normalizeText(song.name)

  if (!id || !name) {
    return null
  }

  return {
    id,
    name,
    alias: Array.isArray(song.alias) ? song.alias : [],
    artists: Array.isArray(song.artists) ? song.artists : [],
    duration: Number.isFinite(Number(song.duration))
      ? Number(song.duration)
      : 0,
    album: song.album && typeof song.album === 'object' ? song.album : {},
    coverUrl: song.coverUrl || song.cover_url || song.cover || null,
  }
}

function createUserFromClaims(claims) {
  const email = normalizeText(claims.email)
  const username =
    normalizeText(claims.username) || email.split('@')[0] || '用户'

  return {
    id: normalizeText(claims.sub),
    email,
    username,
  }
}

class TogetherRoomStore {
  constructor() {
    this.rooms = new Map()
  }

  listRoomsForUser(userId) {
    return Array.from(this.rooms.values())
      .sort((a, b) => {
        if (a.owner.id === userId && b.owner.id !== userId) return -1
        if (a.owner.id !== userId && b.owner.id === userId) return 1
        return a.createdAt - b.createdAt
      })
      .map((room) => this.serializeRoom(room, userId))
  }

  getRoom(roomId) {
    return this.rooms.get(normalizeText(roomId)) || null
  }

  createRoom({ name, isPrivate, password }, owner) {
    const roomName = normalizeText(name)

    if (!roomName) {
      const error = new Error('房间名不能为空')
      error.status = 400
      throw error
    }

    if (isPrivate && !normalizeText(password)) {
      const error = new Error('私密房间需要密码')
      error.status = 400
      throw error
    }

    let id = createRoomId()
    while (this.rooms.has(id)) {
      id = createRoomId()
    }

    const now = Date.now()
    const room = {
      id,
      name: roomName,
      owner,
      isPrivate: Boolean(isPrivate),
      passwordHash: isPrivate ? createPasswordHash(password) : null,
      participants: new Map(),
      playlist: [],
      playback: {
        currentSongId: null,
        isPlaying: false,
        positionMs: 0,
        updatedAt: now,
      },
      createdAt: now,
      updatedAt: now,
    }

    this.rooms.set(id, room)
    return room
  }

  deleteRoom(roomId, user) {
    const room = this.requireRoom(roomId)
    this.requireOwner(room, user)
    this.rooms.delete(room.id)
    return room
  }

  joinRoom(roomId, user, connectionId, password) {
    const room = this.requireRoom(roomId)

    if (
      room.isPrivate &&
      room.owner.id !== user.id &&
      room.passwordHash !== createPasswordHash(password || '')
    ) {
      const error = new Error('房间密码错误')
      error.status = 403
      throw error
    }

    this.addParticipant(room, user, connectionId)
    room.updatedAt = Date.now()
    return room
  }

  leaveRoom(roomId, userId, connectionId) {
    const room = this.getRoom(roomId)
    if (!room) return null

    const participant = room.participants.get(userId)
    if (!participant) return room

    participant.connectionIds.delete(connectionId)
    if (participant.connectionIds.size === 0) {
      room.participants.delete(userId)
    }
    room.updatedAt = Date.now()
    return room
  }

  addSong(roomId, songLike) {
    const room = this.requireRoom(roomId)
    const song = normalizeSong(songLike)

    if (!song) {
      const error = new Error('歌曲信息不完整')
      error.status = 400
      throw error
    }

    const existingIndex = room.playlist.findIndex((item) => item.id === song.id)
    if (existingIndex < 0) {
      room.playlist.push(song)
    }
    if (!room.playback.currentSongId) {
      room.playback.currentSongId = room.playlist[0]?.id || null
    }
    room.updatedAt = Date.now()
    return room
  }

  playNext(roomId, user, { songId, song }) {
    const room = this.requireRoom(roomId)
    this.requireOwner(room, user)

    const normalizedSongId = normalizeText(songId || song?.id)
    let targetIndex = room.playlist.findIndex(
      (item) => item.id === normalizedSongId,
    )

    if (targetIndex < 0 && song) {
      const normalizedSong = normalizeSong(song)
      if (!normalizedSong) {
        const error = new Error('歌曲信息不完整')
        error.status = 400
        throw error
      }
      room.playlist.push(normalizedSong)
      targetIndex = room.playlist.length - 1
    }

    if (targetIndex < 0) {
      const error = new Error('歌曲不在房间歌单中')
      error.status = 404
      throw error
    }

    const currentIndex = room.playlist.findIndex(
      (item) => item.id === room.playback.currentSongId,
    )
    if (
      currentIndex < 0 ||
      targetIndex === currentIndex ||
      targetIndex === currentIndex + 1
    ) {
      return room
    }

    const [targetSong] = room.playlist.splice(targetIndex, 1)
    const adjustedCurrentIndex =
      targetIndex < currentIndex ? currentIndex - 1 : currentIndex
    room.playlist.splice(adjustedCurrentIndex + 1, 0, targetSong)
    room.updatedAt = Date.now()
    return room
  }

  removeSong(roomId, user, songId) {
    const room = this.requireRoom(roomId)
    this.requireOwner(room, user)

    const normalizedSongId = normalizeText(songId)
    const index = room.playlist.findIndex(
      (item) => item.id === normalizedSongId,
    )

    if (index < 0) {
      return room
    }

    const [removed] = room.playlist.splice(index, 1)
    if (removed.id === room.playback.currentSongId) {
      const nextSong = room.playlist[index] || room.playlist[0] || null
      room.playback.currentSongId = nextSong ? nextSong.id : null
      room.playback.positionMs = 0
      room.playback.updatedAt = Date.now()
    }
    room.updatedAt = Date.now()
    return room
  }

  setPlayback(roomId, user, patch) {
    const room = this.requireRoom(roomId)
    this.requireOwner(room, user)

    if (patch.currentSongId !== undefined) {
      const songId = normalizeText(patch.currentSongId)
      const exists = !songId || room.playlist.some((song) => song.id === songId)
      if (!exists) {
        const error = new Error('播放歌曲不在房间歌单中')
        error.status = 400
        throw error
      }
      room.playback.currentSongId = songId || null
    }

    if (patch.isPlaying !== undefined) {
      room.playback.isPlaying = Boolean(patch.isPlaying)
    }

    if (patch.positionMs !== undefined) {
      room.playback.positionMs = Math.max(0, Number(patch.positionMs) || 0)
    }

    room.playback.updatedAt = Date.now()
    room.updatedAt = Date.now()
    return room
  }

  serializeRoom(room, userId) {
    return {
      id: room.id,
      name: room.name,
      owner: room.owner,
      ownerId: room.owner.id,
      ownerName: room.owner.username,
      isOwnedByMe: room.owner.id === userId,
      isPrivate: room.isPrivate,
      listenerCount: room.participants.size,
      songCount: room.playlist.length,
      participants: Array.from(room.participants.values()).map(
        (participant) => ({
          id: participant.user.id,
          email: participant.user.email,
          nickname: participant.user.username,
          username: participant.user.username,
          isOwner: participant.user.id === room.owner.id,
          joinedAt: participant.joinedAt,
        }),
      ),
      playlist: room.playlist,
      playback: room.playback,
      createdAt: room.createdAt,
      updatedAt: room.updatedAt,
    }
  }

  addParticipant(room, user, connectionId) {
    const existing = room.participants.get(user.id)
    if (existing) {
      existing.connectionIds.add(connectionId)
      return
    }

    room.participants.set(user.id, {
      user,
      joinedAt: Date.now(),
      connectionIds: new Set([connectionId]),
    })
  }

  requireRoom(roomId) {
    const room = this.getRoom(roomId)
    if (!room) {
      const error = new Error('房间不存在')
      error.status = 404
      throw error
    }
    return room
  }

  requireOwner(room, user) {
    if (room.owner.id !== user.id) {
      const error = new Error('只有房主可以执行该操作')
      error.status = 403
      throw error
    }
  }
}

module.exports = {
  TogetherRoomStore,
  createUserFromClaims,
}
