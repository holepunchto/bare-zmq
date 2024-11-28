const { Duplex } = require('bare-stream')
const binding = require('./binding')
const errors = require('./lib/errors')

exports.Context = class ZMQContext {
  constructor() {
    try {
      this._handle = binding.createContext()
    } catch (err) {
      if (err.code === 'EMFILE') {
        throw errors.TOO_MANY_OPEN_FILES()
      }

      throw err
    }
  }

  destroy() {
    this._handle = null
  }
}

function ZMQSocket(Base) {
  return class ZMQSocket extends Base {
    constructor(context, type, opts) {
      super(opts)

      try {
        this._handle = binding.createSocket(context._handle, type)
      } catch (err) {
        if (err.code === 'EMFILE') {
          throw errors.TOO_MANY_OPEN_FILES()
        }

        throw err
      }

      this._poller = new ZMQPoller(this)

      this._pendingWrite = null
      this._pendingDestroy = null
    }

    bind(endpoint) {
      try {
        binding.bindSocket(this._handle, endpoint)
      } catch (err) {
        throw err
      }
    }

    connect(endpoint) {
      try {
        binding.connectSocket(this._handle, endpoint)
      } catch (err) {
        throw err
      }
    }

    _read() {
      this._poller.readable = true
    }

    _writev(chunks, cb) {
      this._pendingWrite = [chunks, cb]
      this._poller.writable = true
    }

    _destroy(err, cb) {
      this._poller.close()
      this._pendingDestroy = cb
    }

    _onpoll(err, events) {
      if (err) return this._socket.destroy(err)

      if (events & binding.UV_READABLE) {
        while (true) {
          const message = binding.receiveMessage(this._handle)

          if (message === null) break

          if (this.push(Buffer.from(message)) === false) {
            this._poller.readable = false
          }
        }
      }

      if (events & binding.UV_WRITABLE) {
        const [chunks, cb] = this._pendingWrite

        while (chunks.length) {
          const { chunk } = chunks.pop()

          if (binding.sendMessage(this._handle, chunk) === false) {
            chunks.unshift(chunk)

            break
          }
        }

        if (chunks.length === 0) {
          this._pendingWrite = null
          this._poller.writable = false

          cb(null)
        }
      }
    }

    _onclose(err) {
      this._handle = null
      this._pendingDestroy(err)
    }
  }
}

exports.PairSocket = class ZMQPairSocket extends ZMQSocket(Duplex) {
  constructor(context, opts) {
    super(context, binding.ZMQ_PAIR, opts)
  }
}

class ZMQPoller {
  constructor(socket) {
    this._socket = socket
    this._events = 0
    this._handle = binding.createPoller(
      socket._handle,
      socket,
      socket._onpoll,
      socket._onclose
    )
  }

  get readable() {
    return (this._events & binding.UV_READABLE) !== 0
  }

  set readable(readable) {
    this._update(readable, this.writable)
  }

  get writable() {
    return (this._events & binding.UV_WRITABLE) !== 0
  }

  set writable(writable) {
    this._update(this.readable, writable)
  }

  close() {
    binding.closePoller(this._handle)
  }

  _update(readable, writable) {
    let events = 0

    if (readable) events |= binding.UV_READABLE
    if (writable) events |= binding.UV_WRITABLE

    if (this._events === events) return

    this._events = events

    binding.updatePoller(this._handle, events)
  }
}
