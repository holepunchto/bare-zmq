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

  static CONTEXT_CLOSED(msg) {
    return new ZMQError(msg, 'CONTEXT_CLOSED', ZMQError.CONTEXT_CLOSED)
  }
}
