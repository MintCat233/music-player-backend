const { assertSupabaseConfigured } = require('../lib/supabase')

function createHttpError(status, message) {
  const error = new Error(message)
  error.status = status
  return error
}

function normalizeName(name) {
  if (typeof name !== 'string') {
    return ''
  }
  return name.trim()
}

function normalizeSonglist(row, songCount = 0) {
  return {
    id: row.id,
    user_id: row.user_id,
    name: row.name,
    description: row.description,
    song_count: songCount,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}

function countSongsBySonglist(songRows) {
  return songRows.reduce((counts, row) => {
    counts[row.songlist_id] = (counts[row.songlist_id] || 0) + 1
    return counts
  }, {})
}

async function listSonglists(userid, supabaseAdmin) {
  assertSupabaseConfigured(supabaseAdmin)

  if (!userid) {
    throw createHttpError(400, 'userid is required')
  }

  const { data: songlists, error } = await supabaseAdmin
    .from('songlists')
    .select('id,user_id,name,description,created_at,updated_at')
    .eq('user_id', userid)
    .order('updated_at', { ascending: false })

  if (error) {
    throw error
  }

  const ids = songlists.map((songlist) => songlist.id)
  if (ids.length === 0) {
    return []
  }

  const { data: songRows, error: songRowsError } = await supabaseAdmin
    .from('songlist_songs')
    .select('songlist_id')
    .in('songlist_id', ids)

  if (songRowsError) {
    throw songRowsError
  }

  const counts = countSongsBySonglist(songRows || [])
  return songlists.map((songlist) =>
    normalizeSonglist(songlist, counts[songlist.id] || 0),
  )
}

async function createSonglist(userid, supabaseAdmin, name, description = null) {
  assertSupabaseConfigured(supabaseAdmin)

  if (!userid) {
    throw createHttpError(400, 'userid is required')
  }

  const normalizedName = normalizeName(name)
  if (!normalizedName) {
    throw createHttpError(400, 'name is required')
  }

  const { data, error } = await supabaseAdmin
    .from('songlists')
    .insert({
      user_id: userid,
      name: normalizedName,
      description,
    })
    .select('id,user_id,name,description,created_at,updated_at')
    .single()

  if (error) {
    throw error
  }

  return normalizeSonglist(data, 0)
}

async function renameSonglist(userid, supabaseAdmin, songlistId, name) {
  assertSupabaseConfigured(supabaseAdmin)

  const normalizedName = normalizeName(name)
  if (!normalizedName) {
    throw createHttpError(400, 'name is required')
  }

  const { data, error } = await supabaseAdmin
    .from('songlists')
    .update({
      name: normalizedName,
    })
    .eq('id', songlistId)
    .eq('user_id', userid)
    .select('id,user_id,name,description,created_at,updated_at')
    .maybeSingle()

  if (error) {
    throw error
  }

  if (!data) {
    throw createHttpError(404, 'songlist not found')
  }

  const [withCount] = await listSonglists(userid, supabaseAdmin).then((items) =>
    items.filter((item) => item.id === songlistId),
  )
  return withCount || normalizeSonglist(data, 0)
}

async function deleteSonglist(userid, supabaseAdmin, songlistId) {
  assertSupabaseConfigured(supabaseAdmin)

  const { data, error } = await supabaseAdmin
    .from('songlists')
    .delete()
    .eq('id', songlistId)
    .eq('user_id', userid)
    .select('id')
    .maybeSingle()

  if (error) {
    throw error
  }

  if (!data) {
    throw createHttpError(404, 'songlist not found')
  }

  return true
}

async function getSonglistSongs(userid, supabaseAdmin, songlistId) {
  assertSupabaseConfigured(supabaseAdmin)

  const { data: songlist, error } = await supabaseAdmin
    .from('songlists')
    .select('id,user_id,name,description,created_at,updated_at')
    .eq('id', songlistId)
    .eq('user_id', userid)
    .maybeSingle()

  if (error) {
    throw error
  }

  if (!songlist) {
    throw createHttpError(404, 'songlist not found')
  }

  const { data: songs, error: songsError } = await supabaseAdmin
    .from('songlist_songs')
    .select('song_id')
    .eq('songlist_id', songlistId)
    .order('created_at', { ascending: true })

  if (songsError) {
    throw songsError
  }

  const songIds = (songs || []).map((song) => String(song.song_id))
  return {
    songlist: normalizeSonglist(songlist, songIds.length),
    song_ids: songIds,
  }
}

async function addSongToSonglist(userid, supabaseAdmin, songlistId, songId) {
  assertSupabaseConfigured(supabaseAdmin)

  const songIdString = String(songId || '').trim()
  if (!songIdString) {
    throw createHttpError(400, 'song_id is required')
  }

  await getSonglistSongs(userid, supabaseAdmin, songlistId)

  const { error } = await supabaseAdmin.from('songlist_songs').upsert(
    {
      songlist_id: songlistId,
      song_id: songIdString,
    },
    { onConflict: 'songlist_id,song_id' },
  )

  if (error) {
    throw error
  }

  return getSonglistSongs(userid, supabaseAdmin, songlistId)
}

module.exports = {
  addSongToSonglist,
  createSonglist,
  deleteSonglist,
  getSonglistSongs,
  listSonglists,
  renameSonglist,
}
