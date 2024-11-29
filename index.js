const EventEmitter = require('bare-events')
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

class ZMQSocket extends EventEmitter {
  constructor(context, type) {
    super()

    try {
      this._handle = binding.createSocket(context._handle, type)
    } catch (err) {
      if (err.code === 'EMFILE') {
        throw errors.TOO_MANY_OPEN_FILES()
      }

      throw err
    }

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
