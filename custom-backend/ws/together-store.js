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

function normalizeNumber(value, fallback = 0) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback
}

function normalizeTimestamp(value, fallback = Date.now()) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function timestampToIso(value) {
  return new Date(normalizeTimestamp(value)).toISOString()
}

function normalizeSong(song) {
  const songLike =
    song && typeof song === 'object' ? song : { id: song, name: song }
  const id = normalizeText(songLike.id || songLike.songId || songLike.song_id)
  const name = normalizeText(songLike.name) || id

  if (!id) {
    return null
  }

  const duration = Number(songLike.duration || songLike.durationMs)
  const safeDuration = Number.isFinite(duration) && duration > 0 ? duration : 0

  return {
    id,
    name,
    alias: Array.isArray(songLike.alias) ? songLike.alias : [],
    artists: Array.isArray(songLike.artists) ? songLike.artists : [],
    duration: safeDuration,
    album:
      songLike.album && typeof songLike.album === 'object'
        ? songLike.album
        : {},
    coverUrl: songLike.coverUrl || songLike.cover_url || songLike.cover || null,
  }
}

function normalizeUser(userLike, fallbackId) {
  const id = normalizeText(userLike?.id || fallbackId)
  const email = normalizeText(userLike?.email)
  const username =
    normalizeText(userLike?.username || userLike?.nickname) ||
    email.split('@')[0] ||
    '用户'

  return {
    id,
    email,
    username,
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

function createRoomFromRow(row) {
  const now = Date.now()
  const owner = normalizeUser(row.owner, row.owner_id)
  const playlist = Array.isArray(row.playlist)
    ? row.playlist.map(normalizeSong).filter(Boolean)
    : []
  const playbackLike =
    row.playback && typeof row.playback === 'object' ? row.playback : {}

  return {
    id: normalizeText(row.id),
    name: normalizeText(row.name),
    owner,
    isPrivate: row.is_private === true,
    passwordHash: row.password_hash || null,
    participants: new Map(),
    playbackHostUserId: null,
    playlist,
    playback: {
      currentSongId:
        normalizeText(
          playbackLike.currentSongId || playbackLike.current_song_id,
        ) || null,
      isPlaying: playbackLike.isPlaying === true,
      positionMs: normalizeNumber(playbackLike.positionMs),
      durationMs: normalizeNumber(playbackLike.durationMs),
      updatedAt: normalizeTimestamp(
        playbackLike.updatedAt,
        normalizeTimestamp(row.updated_at, now),
      ),
    },
    createdAt: normalizeTimestamp(row.created_at, now),
    updatedAt: normalizeTimestamp(row.updated_at, now),
  }
}

function createRoomRow(room) {
  return {
    id: room.id,
    name: room.name,
    owner_id: room.owner.id,
    owner: room.owner,
    is_private: room.isPrivate,
    password_hash: room.passwordHash,
    playlist: room.playlist,
    playback: room.playback,
    created_at: timestampToIso(room.createdAt),
    updated_at: timestampToIso(room.updatedAt),
  }
}

class TogetherRoomStore {
  constructor(options = {}) {
    this.rooms = new Map()
    this.supabaseAdmin = options.supabaseAdmin || null
  }

  async loadPersistedRooms() {
    if (!this.supabaseAdmin) {
      console.warn(
        'Together rooms persistence is disabled: Supabase admin client is not configured',
      )
      return
    }

    const { data, error } = await this.supabaseAdmin
      .from('together_rooms')
      .select('*')
      .order('created_at', { ascending: true })

    if (error) {
      const wrappedError = new Error(
        `Failed to load together rooms from Supabase: ${error.message}`,
      )
      wrappedError.status = 500
      throw wrappedError
    }

    this.rooms.clear()
    for (const row of data || []) {
      const room = createRoomFromRow(row)
      if (!room.id || !room.name || !room.owner.id) {
        continue
      }
      this.rooms.set(room.id, room)
    }
  }

  async persistRoom(room) {
    if (!this.supabaseAdmin || !room) {
      return
    }

    const { error } = await this.supabaseAdmin
      .from('together_rooms')
      .upsert(createRoomRow(room), { onConflict: 'id' })

    if (error) {
      const wrappedError = new Error(
        `Failed to persist together room: ${error.message}`,
      )
      wrappedError.status = 500
      throw wrappedError
    }
  }

  async deletePersistedRoom(roomId) {
    if (!this.supabaseAdmin || !roomId) {
      return
    }

    const { error } = await this.supabaseAdmin
      .from('together_rooms')
      .delete()
      .eq('id', roomId)

    if (error) {
      const wrappedError = new Error(
        `Failed to delete together room: ${error.message}`,
      )
      wrappedError.status = 500
      throw wrappedError
    }
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
      playbackHostUserId: null,
      playlist: [],
      playback: {
        currentSongId: null,
        isPlaying: false,
        positionMs: 0,
        durationMs: 0,
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
    this.ensurePlaybackHost(room)
    room.updatedAt = Date.now()
    return room
  }

  leaveRoom(roomId, userId, connectionId) {
    const room = this.getRoom(roomId)
    if (!room) return null

    const participant = room.participants.get(userId)
    if (!participant) return room

    this.advancePlayback(room)
    participant.connectionIds.delete(connectionId)
    if (participant.connectionIds.size === 0) {
      room.participants.delete(userId)
    }
    this.ensurePlaybackHost(room)
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
      room.playback.durationMs = room.playlist[0]?.duration || 0
    }
    room.updatedAt = Date.now()
    return room
  }

  playNext(roomId, user, { songId, song }) {
    const room = this.requireRoom(roomId)
    this.requireParticipant(room, user)

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
      room.playback.durationMs = nextSong?.duration || 0
      room.playback.updatedAt = Date.now()
    }
    room.updatedAt = Date.now()
    return room
  }

  setPlayback(roomId, user, patch) {
    const room = this.requireRoom(roomId)
    const isOwner = room.owner.id === user.id
    const isPlaybackHost = this.isPlaybackHost(room, user)
    const isParticipant = room.participants.has(user.id)
    const isControlCommand = patch.controlCommand === true
    let currentSongChanged = false
    if (!isOwner && !isPlaybackHost && !(isParticipant && isControlCommand)) {
      const error = new Error('无权限同步播放状态')
      error.status = 403
      throw error
    }
    this.advancePlayback(room)

    if (isControlCommand && !isOwner && patch.currentSongId === undefined) {
      room.playback.updatedAt = Date.now()
      room.updatedAt = Date.now()
      return room
    }

    if (!isOwner && !isControlCommand && patch.isPlaying !== undefined) {
      const reportedIsPlaying = Boolean(patch.isPlaying)
      if (reportedIsPlaying !== room.playback.isPlaying) {
        return room
      }
    }

    if (patch.currentSongId !== undefined) {
      if (!isControlCommand) {
        const reportedSongId = normalizeText(patch.currentSongId)
        if (reportedSongId !== room.playback.currentSongId) {
          room.playback.updatedAt = Date.now()
          room.updatedAt = Date.now()
          return room
        }
      }
      const songId = normalizeText(patch.currentSongId)
      const exists = !songId || room.playlist.some((song) => song.id === songId)
      if (!exists) {
        const error = new Error('播放歌曲不在房间歌单中')
        error.status = 400
        throw error
      }
      currentSongChanged = songId !== room.playback.currentSongId
      room.playback.currentSongId = songId || null
      const song = room.playlist.find((item) => item.id === songId)
      if (currentSongChanged) {
        const requestedDuration = Math.max(0, Number(patch.durationMs) || 0)
        room.playback.positionMs = 0
        room.playback.durationMs = song?.duration || requestedDuration || 0
      } else if (song?.duration && room.playback.durationMs <= 0) {
        room.playback.durationMs = song.duration
      }
    }

    if (patch.durationMs !== undefined && !currentSongChanged) {
      room.playback.durationMs = Math.max(0, Number(patch.durationMs) || 0)
    }

    if ((isOwner || isControlCommand) && patch.isPlaying !== undefined) {
      room.playback.isPlaying = Boolean(patch.isPlaying)
    }

    if (patch.positionMs !== undefined && !currentSongChanged) {
      room.playback.positionMs = Math.max(0, Number(patch.positionMs) || 0)
    }

    room.playback.updatedAt = Date.now()
    room.updatedAt = Date.now()
    return room
  }

  serializeRoom(room, userId) {
    this.advancePlayback(room)
    if (room.participants.size > 0) {
      this.ensurePlaybackHost(room)
    }
    return {
      id: room.id,
      name: room.name,
      owner: room.owner,
      ownerId: room.owner.id,
      ownerName: room.owner.username,
      isOwnedByMe: room.owner.id === userId,
      playbackHostUserId: room.playbackHostUserId,
      hostUserId: room.playbackHostUserId,
      isPlaybackHost: room.playbackHostUserId === userId,
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
          isPlaybackHost: participant.user.id === room.playbackHostUserId,
        }),
      ),
      playlist: room.playlist.map((song) => song.id),
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

  advancePlayback(room, now = Date.now()) {
    if (!room.playback.currentSongId || room.playlist.length === 0) {
      room.playback.currentSongId = null
      room.playback.positionMs = 0
      room.playback.durationMs = 0
      room.playback.isPlaying = false
      room.playback.updatedAt = now
      return
    }

    if (!room.playback.isPlaying) {
      room.playback.updatedAt = now
      return
    }

    const elapsed = Math.max(0, now - (room.playback.updatedAt || now))
    let position = Math.max(0, room.playback.positionMs + elapsed)
    let currentIndex = room.playlist.findIndex(
      (song) => song.id === room.playback.currentSongId,
    )
    if (currentIndex < 0) {
      currentIndex = 0
      room.playback.currentSongId = room.playlist[0].id
      position = 0
    }

    let duration =
      Number(room.playback.durationMs) ||
      room.playlist[currentIndex].duration ||
      0
    while (duration > 0 && position >= duration && room.playlist.length > 0) {
      position -= duration
      currentIndex = (currentIndex + 1) % room.playlist.length
      const nextSong = room.playlist[currentIndex]
      room.playback.currentSongId = nextSong.id
      duration = Number(nextSong.duration) || 0
      room.playback.durationMs = duration
      if (duration <= 0) {
        position = 0
        break
      }
    }

    room.playback.positionMs = position
    room.playback.updatedAt = now
  }

  ensurePlaybackHost(room) {
    const now = Date.now()
    if (room.participants.size === 0) {
      this.advancePlayback(room, now)
      room.playbackHostUserId = null
      room.playback.isPlaying = false
      room.playback.updatedAt = now
      return
    }

    if (
      room.playbackHostUserId &&
      room.participants.has(room.playbackHostUserId)
    ) {
      return
    }

    const ownerParticipant = room.participants.get(room.owner.id)
    const nextHost = ownerParticipant || this.firstParticipant(room)
    room.playbackHostUserId = nextHost?.user.id || null
  }

  firstParticipant(room) {
    return (
      Array.from(room.participants.values()).sort(
        (a, b) => a.joinedAt - b.joinedAt,
      )[0] || null
    )
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

  requireParticipant(room, user) {
    if (!room.participants.has(user.id)) {
      const error = new Error('请先加入房间')
      error.status = 403
      throw error
    }
  }

  requirePlaybackHost(room, user) {
    if (!this.isPlaybackHost(room, user)) {
      const error = new Error('无权限同步播放状态')
      error.status = 403
      throw error
    }
  }

  isPlaybackHost(room, user) {
    this.ensurePlaybackHost(room)
    return room.playbackHostUserId === user.id
  }
}

module.exports = {
  TogetherRoomStore,
  createUserFromClaims,
}
