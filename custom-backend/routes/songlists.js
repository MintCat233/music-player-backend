const express = require('express')
const { createSupabaseAdminClient } = require('../lib/supabase')
const { createAppAuthMiddleware } = require('../middleware/auth')
const { sendError, sendSuccess } = require('../util/response')
const {
  addSongToSonglist,
  createSonglist,
  deleteSonglist,
  getSonglistSongs,
  listSonglists,
  renameSonglist,
} = require('../services/songlists')

function getAuthedUserid(req) {
  return req.user && req.user.sub
}

function handleRouteError(
  res,
  error,
  fallbackMessage = 'Internal server error',
) {
  console.error(fallbackMessage, error)
  sendError(res, error.status || 500, error.message || fallbackMessage)
}

function createSonglistsRouter(config) {
  const requireAuth = createAppAuthMiddleware(config.jwt)
  const supabaseAdmin = createSupabaseAdminClient(config)
  const router = express.Router()

  router.get('/', requireAuth, async (req, res) => {
    try {
      const songlists = await listSonglists(getAuthedUserid(req), supabaseAdmin)
      sendSuccess(res, { songlists })
    } catch (error) {
      handleRouteError(res, error, 'Error listing songlists')
    }
  })

  router.post('/', requireAuth, async (req, res) => {
    const body = req.body || {}

    try {
      const songlist = await createSonglist(
        getAuthedUserid(req),
        supabaseAdmin,
        body.name,
        body.description || null,
      )
      sendSuccess(res, { songlist })
    } catch (error) {
      handleRouteError(res, error, 'Error creating songlist')
    }
  })

  router.get('/:songlistId', requireAuth, async (req, res) => {
    try {
      const result = await getSonglistSongs(
        getAuthedUserid(req),
        supabaseAdmin,
        req.params.songlistId,
      )
      sendSuccess(res, result)
    } catch (error) {
      handleRouteError(res, error, 'Error fetching songlist')
    }
  })

  router.patch('/:songlistId', requireAuth, async (req, res) => {
    const body = req.body || {}

    try {
      const songlist = await renameSonglist(
        getAuthedUserid(req),
        supabaseAdmin,
        req.params.songlistId,
        body.name,
      )
      sendSuccess(res, { songlist })
    } catch (error) {
      handleRouteError(res, error, 'Error renaming songlist')
    }
  })

  router.delete('/:songlistId', requireAuth, async (req, res) => {
    try {
      await deleteSonglist(
        getAuthedUserid(req),
        supabaseAdmin,
        req.params.songlistId,
      )
      sendSuccess(res, null)
    } catch (error) {
      handleRouteError(res, error, 'Error deleting songlist')
    }
  })

  router.post('/:songlistId/songs', requireAuth, async (req, res) => {
    const body = req.body || {}

    try {
      const result = await addSongToSonglist(
        getAuthedUserid(req),
        supabaseAdmin,
        req.params.songlistId,
        body.song_id || body.songId,
      )
      sendSuccess(res, result)
    } catch (error) {
      handleRouteError(res, error, 'Error adding song to songlist')
    }
  })

  return router
}

module.exports = {
  createSonglistsRouter,
}
