async function syncNcmLikelist(userid, supabaseAdmin,likelist){ 
  for (const item of likelist) {
    const { error } = await supabaseAdmin.from('like_list')
      .upsert({
        user_id: userid,
        song_id: item.song_id,
      }, { onConflict: 'user_id,song_id' })

    if (error) {
      throw error
    }
  }

  return data ? data.list : []
}

module.exports = {
  syncNcmLikelist,
}
