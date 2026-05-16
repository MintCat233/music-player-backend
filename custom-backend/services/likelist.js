async function syncNcmLikelist(userid, supabaseAdmin, likelist) {
  console.log(
    'syncNcmLikelist called with userid:',
    userid,
    'likelist:',
    likelist,
  )

  const ret = likelist.map(async (item) => {
    const { data, error } = await supabaseAdmin
      .from('like_list')
      .upsert(
        {
          user_id: userid,
          song_id: item,
        },
        { onConflict: 'user_id,song_id' },
      )
      .select('song_id')

    if (error) {
      console.error('Error syncing like list item:', item, 'Error:', error)
      throw error
    }
    console.log(data)

    const songId = data?.[0]?.song_id

    return songId
  })

  return (await Promise.all(ret)) ?? []
}

module.exports = {
  syncNcmLikelist,
}
