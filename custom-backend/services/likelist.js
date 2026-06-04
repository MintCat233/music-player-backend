const { assertSupabaseConfigured } = require('../lib/supabase')

async function syncNcmLikelist(userid, supabaseAdmin, likelist) {
  console.log(
    'syncNcmLikelist called with userid:',
    userid,
    'likelist:',
    likelist,
  )
  assertSupabaseConfigured(supabaseAdmin)

  if (!userid) {
    const e = new Error('userid is required')
    e.status = 400
    throw e
  }

  if (!Array.isArray(likelist)) {
    const e = new Error('likelist must be an array')
    e.status = 400
    throw e
  }

  const processed = []

  for (const rawItem of likelist) {
    // Support either array of primitive ids or objects like { song_id } / { id }
    const songId =
      rawItem && (rawItem.song_id || rawItem.id || rawItem.songId || rawItem)

    if (!songId) {
      console.warn('Skipping invalid likelist item (no song id):', rawItem)
      continue
    }

    const songIdString = String(songId)

    const { data, error } = await supabaseAdmin
      .from('like_list')
      .upsert(
        {
          user_id: userid,
          song_id: songIdString,
        },
        { onConflict: 'user_id,song_id' },
      )
      .select('song_id')

    if (error) {
      console.error('Error syncing like list item:', rawItem, 'Error:', error)
      throw error
    }

    const insertedSongId = String(data?.[0]?.song_id || songIdString)
    processed.push(insertedSongId)
  }

  return processed
}

async function getLikelist(userid, supabaseAdmin) {
  assertSupabaseConfigured(supabaseAdmin)

  if (!userid) {
    const e = new Error('userid is required')
    e.status = 400
    throw e
  }

  const { data, error } = await supabaseAdmin
    .from('like_list')
    .select('song_id')
    .eq('user_id', userid)

  if (error) {
    console.error(
      'Error fetching like list for userid:',
      userid,
      'Error:',
      error,
    )
    throw error
  }

  return data?.map((item) => String(item.song_id)) ?? []
}

async function addLikedSong(userid, supabaseAdmin, songId) {
  assertSupabaseConfigured(supabaseAdmin)

  if (!userid) {
    const e = new Error('userid is required')
    e.status = 400
    throw e
  }

  const songIdString = String(songId || '').trim()
  if (!songIdString) {
    const e = new Error('song_id is required')
    e.status = 400
    throw e
  }

  const { error } = await supabaseAdmin.from('like_list').upsert(
    {
      user_id: userid,
      song_id: songIdString,
    },
    { onConflict: 'user_id,song_id' },
  )

  if (error) {
    console.error('Error adding liked song:', songIdString, 'Error:', error)
    throw error
  }

  return getLikelist(userid, supabaseAdmin)
}

module.exports = {
  addLikedSong,
  syncNcmLikelist,
  getLikelist,
}
