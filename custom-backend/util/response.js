function sendSuccess(res, data = null, msg = 'success') {
  console.log('Response:', {
    code: 200,
    msg,
    data,}
  )

  res.send({
    code: 200,
    msg,
    data,
  })
}

function sendError(res, code, msg) {
    console.log('Response:', {
    code,
    msg}
  )
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
