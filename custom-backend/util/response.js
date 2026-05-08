function sendSuccess(res, data = null, msg = 'success') {
  res.send({
    code: 200,
    msg,
    data,
  })
}

function sendError(res, code, msg) {
  res.status(code).send({
    code,
    msg,
    data: null,
  })
}

module.exports = {
  sendError,
  sendSuccess,
}
