module.exports = class ZMQError extends Error {
  constructor(msg, code, fn = ZMQError) {
    super(`${code}: ${msg}`)
    this.code = code

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, fn)
    }
  }

  get name() {
    return 'ZMQError'
  }

  static TOO_MANY_OPEN_FILES(msg = 'The limit on open files has been reached') {
    return new ZMQError(
      msg,
      'TOO_MANY_OPEN_FILES',
      ZMQError.TOO_MANY_OPEN_FILES
    )
  }
}
