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

    const { data, error } = await supabaseAdmin
      .from('like_list')
      .upsert(
        {
          user_id: userid,
          song_id: songId,
        },
        { onConflict: 'user_id,song_id' },
      )
      .select('song_id')

    if (error) {
      console.error('Error syncing like list item:', rawItem, 'Error:', error)
      throw error
    }

    const insertedSongId = data?.[0]?.song_id || songId
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

  return data?.map((item) => item.song_id) ?? []
}

module.exports = {
  syncNcmLikelist,
  getLikelist,
}
