async function syncNcmLikelist(userid, supabaseAdmin,likelist){ 
  console.log('syncNcmLikelist called with userid:', userid, 'likelist:', likelist)
  for (const item of likelist) {
    const { error } = await supabaseAdmin.from('like_list')
      .upsert({
        user_id: userid,
        song_id: item,
      }, { onConflict: 'user_id,song_id' })

    if (error) {
      console.error('Error syncing like list item:', item, 'Error:', error)
      throw error
    }
  }

  return data ? data.list : []
}

module.exports = {
  syncNcmLikelist,
}
