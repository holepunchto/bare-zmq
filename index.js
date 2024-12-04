const EventEmitter = require('bare-events')
const stream = require('bare-stream')
const binding = require('./binding')
const errors = require('./lib/errors')

const empty = Buffer.alloc(0)

exports.Context = class ZMQContext {
  constructor(external = null) {
    if (external === null) {
      binding.createContext(this)
    } else {
      binding.deserializeContext(external, this)
    }

    this._sockets = new Set()
    this._closing = null
  }

  close() {
    if (this._closing !== null) return this._closing.promise

    this._closing = Promise.withResolvers()
    this._closeMaybe()

    return this._closing.promise
  }

  _closeMaybe() {
    if (this._closing && this._sockets.size === 0) {
      binding.destroyContext(this)

      this._closing.resolve()
    }
  }

  toExternal() {
    return binding.serializeContext(this)
  }

  static from(external) {
    return new this(external)
  }

  [Symbol.for('bare.serialize')]() {
    return this.toExternal()
  }

  static [Symbol.for('bare.deserialize')](external) {
    return this.from(external)
  }
}

class ZMQSocket extends EventEmitter {
  constructor(context, type) {
    if (context._closing) {
      throw errors.CONTEXT_CLOSED('Context has already closed')
    }

    super()

    this._context = context
    this._context._sockets.add(this)

    this._endpoint = null
    this._closing = null

    binding.createSocket(this, context, type)

    this._poller = new ZMQPoller(this)
  }

  get endpoint() {
    return this._endpoint
  }

  get readable() {
    return (this._poller._events & binding.UV_READABLE) !== 0
  }

  get writable() {
    return (this._poller._events & binding.UV_WRITABLE) !== 0
  }

  bind(endpoint) {
    this._endpoint = binding.bindSocket(this, endpoint)
  }

  connect(endpoint) {
    this._endpoint = binding.connectSocket(this, endpoint)
  }

  close() {
    if (this._closing !== null) return this._closing.promise

    this._closing = Promise.withResolvers()
    this._poller._close()

    return this._closing.promise
  }

  _onpoll(err, events) {
    if (err) return this.emit('error', err)

    if (events & binding.UV_READABLE) this.emit('readable')
    if (events & binding.UV_WRITABLE) this.emit('writable')
  }

  _onclose() {
    binding.destroySocket(this)

    this._context._sockets.delete(this)
    this._context._closeMaybe()

    this._closing.resolve()

    this.emit('close')
  }
}

function ZMQReadableSocket(Base) {
  return class ZMQReadableSocket extends Base {
    set readable(readable) {
      this._poller._readable = readable
    }

    receive() {
      const message = binding.receiveMessage(this)

      if (message === null) return null

      const { data, more } = message

      return {
        data: Buffer.from(data),
        more
      }
    }

    createReadStream(opts) {
      return new exports.ReadableStream(this, opts)
    }
  }
}

function ZMQWritableSocket(Base) {
  return class ZMQWritableSocket extends Base {
    set writable(writable) {
      this._poller._writable = writable
    }

    send(data, opts = {}) {
      const { more = false } = opts

      let flags = 0

      if (more) flags |= binding.ZMQ_SNDMORE

      if (typeof data === 'string') data = Buffer.from(data)

      return binding.sendMessage(this, data, flags)
    }

    createWriteStream(opts) {
      return new exports.WritableStream(this, opts)
    }
  }
}

function ZMQDuplexSocket(Base) {
  return class ZMQDuplexSocket extends ZMQReadableSocket(
    ZMQWritableSocket(Base)
  ) {
    createDuplexStream(opts) {
      return new exports.DuplexStream(this, opts)
    }
  }
}

exports.ReadableSocket = ZMQReadableSocket(ZMQSocket)

exports.WritableSocket = ZMQWritableSocket(ZMQSocket)

exports.DuplexSocket = ZMQDuplexSocket(ZMQSocket)

class ZMQPoller {
  constructor(socket) {
    this._events = 0
    this._closed = false
    this._handle = binding.createPoller(socket, socket._onpoll, socket._onclose)
  }

  get _readable() {
    return (this._events & binding.UV_READABLE) !== 0
  }

  get _writable() {
    return (this._events & binding.UV_WRITABLE) !== 0
  }

  set _readable(readable) {
    this._update(readable, this._writable)
  }

  set _writable(writable) {
    this._update(this._readable, writable)
  }

  _close() {
    if (this._closed) return
    this._closed = true

    binding.closePoller(this._handle)
  }

  _update(readable, writable) {
    if (this._closed) return

    let events = 0

    if (readable) events |= binding.UV_READABLE
    if (writable) events |= binding.UV_WRITABLE

    if (this._events === events) return

    this._events = events

    binding.updatePoller(this._handle, events)
  }
}

function ZMQStream(Base) {
  return class ZMQStream extends Base {
    constructor(socket, opts) {
      super(opts)

      this._socket = socket
      this._socket
        .on('error', this._onerror.bind(this))
        .on('close', this._onclose.bind(this))
    }

    _destroy(err, cb) {
      this._socket.close().then(cb, cb)
    }

    _onerror(err) {
      this.destroy(err)
    }

    _onclose() {
      this.destroy()
    }
  }
}

function ZMQReadableStream(Base) {
  return class ZMQReadableStream extends Base {
    constructor(socket, opts) {
      super(socket, opts)

      this._socket.on('readable', this._onreadable.bind(this))
    }

    _read() {
      while (true) {
        const message = this._socket.receive()

        if (message === null) {
          this._socket.readable = true
          break
        }

        if (this.push(message.data) === false) {
          this._socket.readable = false
          break
        }
      }
    }

    _onreadable() {
      while (true) {
        const message = this._socket.receive()

        if (message === null) return

        if (this.push(message.data) === false) {
          this._socket.readable = false
          break
        }
      }
    }
  }
}

function ZMQWritableStream(Base) {
  return class ZMQWritableStream extends Base {
    constructor(socket, opts) {
      super(socket, opts)

      this._queue = null
      this._socket.on('writable', this._onwritable.bind(this))
    }

    _writev(chunks, cb) {
      while (chunks.length) {
        const message = chunks.shift()

        if (this._socket.send(message.chunk) === false) {
          chunks.unshift(message)
          break
        }
      }

      if (chunks.length > 0) {
        this._queue = [chunks, cb]
        this._socket.writable = true
      } else {
        cb(null)
      }
    }

    _onwritable() {
      const [chunks, cb] = this._queue

      while (chunks.length) {
        const message = chunks.shift()

        if (this._socket.send(message.chunk) === false) {
          chunks.unshift(message)
          break
        }
      }

      if (chunks.length === 0) {
        this._queue = null
        this._socket.writable = false
        cb(null)
      }
    }
  }
}

function ZMQDuplexStream(Base) {
  return class ZMQDuplexStream extends ZMQReadableStream(
    ZMQWritableStream(Base)
  ) {}
}

exports.ReadableStream = ZMQReadableStream(ZMQStream(stream.Readable))

exports.WritableStream = ZMQWritableStream(ZMQStream(stream.Writable))

exports.DuplexStream = ZMQDuplexStream(ZMQStream(stream.Duplex))

exports.PairSocket = class ZMQPairSocket extends exports.DuplexSocket {
  constructor(context) {
    super(context, binding.ZMQ_PAIR)
  }
}

exports.PublisherSocket = class ZMQPublisherSocket extends (
  exports.WritableSocket
) {
  constructor(context) {
    super(context, binding.ZMQ_PUB)
  }
}

exports.SubscriberSocket = class ZMQSubscriberSocket extends (
  exports.ReadableSocket
) {
  constructor(context) {
    super(context, binding.ZMQ_SUB)
  }

  subscribe(prefix = empty) {
    setSocketOption(this, binding.ZMQ_SUBSCRIBE, prefix)
  }

  unsubscribe(prefix = empty) {
    setSocketOption(this, binding.ZMQ_UNSUBSCRIBE, prefix)
  }
}

exports.RequestSocket = class ZMQRequestSocket extends exports.DuplexSocket {
  constructor(context) {
    super(context, binding.ZMQ_REQ)
  }
}

exports.ReplySocket = class ZMQReplySocket extends exports.DuplexSocket {
  constructor(context) {
    super(context, binding.ZMQ_REP)
  }
}

function getSocketOption(socket, option, data = Buffer.alloc(1024)) {
  const length = binding.getSocketOption(socket, option, data)

  return data.subarray(0, length)
}

function setSocketOption(socket, option, data) {
  if (typeof data === 'string') data = Buffer.from(data)

  binding.setSocketOption(socket, option, data)
}
