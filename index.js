const EventEmitter = require('bare-events')
const stream = require('bare-stream')
const binding = require('./binding')

const empty = Buffer.alloc(0)

exports.Context = class ZMQContext {
  constructor() {
    this._handle = binding.createContext()
  }
}

class ZMQSocket extends EventEmitter {
  constructor(context, type) {
    super()

    this._context = context
    this._handle = binding.createSocket(context._handle, type)

    this._poller = new ZMQPoller(this)
    this._closing = null
  }

  get readable() {
    return this._poller.readable
  }

  get writable() {
    return this._poller.writable
  }

  bind(endpoint) {
    binding.bindSocket(this._handle, endpoint)
  }

  connect(endpoint) {
    binding.connectSocket(this._handle, endpoint)
  }

  close() {
    if (this._closing !== null) return this._closing.promise

    this._closing = Promise.withResolvers()
    this._poller.close()

    return this._closing.promise
  }

  _onpoll(err, events) {
    if (err) return this.emit('error', err)

    if (events & binding.UV_READABLE) this.emit('readable')
    if (events & binding.UV_WRITABLE) this.emit('writable')
  }

  _onclose() {
    this._handle = null
    this._closing.resolve()
    this.emit('close')
  }
}

function ZMQReadableSocket(Base) {
  return class ZMQReadableSocket extends Base {
    set readable(readable) {
      this._poller.readable = readable
    }

    receive() {
      const message = binding.receiveMessage(this._handle)

      if (message === null) return null

      const { data, more } = message

      return {
        data: Buffer.from(data),
        more
      }
    }

    createReadStream() {
      return new exports.ReadableStream(this)
    }
  }
}

function ZMQWritableSocket(Base) {
  return class ZMQWritableSocket extends Base {
    set writable(writable) {
      this._poller.writable = writable
    }

    send(data, opts = {}) {
      const { more = false } = opts

      let flags = 0

      if (more) flags |= binding.ZMQ_SNDMORE

      if (typeof data === 'string') data = Buffer.from(data)

      return binding.sendMessage(this._handle, data, flags)
    }

    createWriteStream() {
      return new exports.WritableStream(this)
    }
  }
}

class ZMQDuplexSocket extends ZMQReadableSocket(ZMQWritableSocket(ZMQSocket)) {}

exports.PairSocket = class ZMQPairSocket extends ZMQDuplexSocket {
  constructor(context) {
    super(context, binding.ZMQ_PAIR)
  }
}

exports.PublisherSocket = class ZMQPublisherSocket extends (
  ZMQWritableSocket(ZMQSocket)
) {
  constructor(context, opts) {
    super(context, binding.ZMQ_PUB, opts)
  }
}

exports.SubscriberSocket = class ZMQSubscriberSocket extends (
  ZMQReadableSocket(ZMQSocket)
) {
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
    this._closed = false
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

exports.ReadableStream = class ZMQReadableStream extends (
  ZMQStream(stream.Readable)
) {
  constructor(socket) {
    super(socket)

    this._socket.on('readable', this._onreadable.bind(this))
  }

  _read() {
    this._socket.readable = true
  }

  _onreadable() {
    while (true) {
      const message = this._socket.receive()

      if (message === null) return

      if (this.push(message.data) === false) {
        this._socket.readable = false
      }
    }
  }
}

exports.WritableStream = class ZMQWritableStream extends (
  ZMQStream(stream.Writable)
) {
  constructor(socket, opts) {
    super(socket, opts)

    this._queue = null
    this._socket.on('writable', this._onwritable.bind(this))
  }

  _writev(chunks, cb) {
    this._queue = [chunks, cb]
    this._socket.writable = true
  }

  _onwritable() {
    const [messages, cb] = this._queue

    while (messages.length) {
      const message = messages.shift()

      if (this._socket.send(message.chunk) === false) {
        messages.unshift(message)
        break
      }
    }

    if (messages.length === 0) {
      this._queue = null
      this._socket.writable = false
      cb(null)
    }
  }
}
