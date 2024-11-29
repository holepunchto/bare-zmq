const { Readable, Writable, Duplex } = require('bare-stream')
const binding = require('./binding')
const errors = require('./lib/errors')

const empty = Buffer.alloc(0)

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
      this._pendingDestroy = cb
      this._poller.close()
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
          const chunk = chunks.shift()

          if (binding.sendMessage(this._handle, chunk.chunk) === false) {
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

    _onclose() {
      this._handle = null
      this._pendingDestroy(null)
    }
  }
}

class ZMQReadableSocket extends ZMQSocket(Readable) {}

class ZMQWritableSocket extends ZMQSocket(Writable) {}

class ZMQDuplexSocket extends ZMQSocket(Duplex) {}

exports.PairSocket = class ZMQPairSocket extends ZMQDuplexSocket {
  constructor(context, opts) {
    super(context, binding.ZMQ_PAIR, opts)
  }
}

exports.PublisherSocket = class ZMQPublisherSocket extends ZMQWritableSocket {
  constructor(context, opts) {
    super(context, binding.ZMQ_PUB, opts)
  }
}

exports.SubscriberSocket = class ZMQSubscriberSocket extends ZMQReadableSocket {
  constructor(context, opts) {
    super(context, binding.ZMQ_SUB, opts)
  }

  subscribe(prefix = empty) {
    if (typeof prefix === 'string') prefix = Buffer.from(prefix)

    binding.setSocketOption(this._handle, binding.ZMQ_SUBSCRIBE, prefix)
  }

  unsubscribe(prefix = empty) {
    if (typeof prefix === 'string') prefix = Buffer.from(prefix)

    binding.setSocketOption(this._handle, binding.ZMQ_UNSUBSCRIBE, prefix)
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
