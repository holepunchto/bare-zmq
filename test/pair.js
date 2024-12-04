const test = require('brittle')
const { Context, PairSocket } = require('..')

test('pair socket, inproc', (t) => {
  t.plan(2)

  const ctx = new Context()

  const a = new PairSocket(ctx)
  t.teardown(() => a.close())

  const b = new PairSocket(ctx)
  t.teardown(() => b.close())

  const endpoint = 'inproc://foo'
  b.bind(endpoint)
  a.connect(endpoint)

  b.readable = true
  b.on('readable', () => {
    const msg = b.receive()
    if (msg === null) return
    t.alike(msg, { data: Buffer.from('hello world'), more: false })
  })

  a.writable = true
  a.on('writable', () => {
    const sent = a.send('hello world')
    if (sent === false) return
    t.is(sent, true)
    a.writable = false
  })
})

test('pair socket, inproc, read and write stream', (t) => {
  t.plan(1)

  const ctx = new Context()

  const a = new PairSocket(ctx)
  t.teardown(() => a.close())

  const b = new PairSocket(ctx)
  t.teardown(() => b.close())

  const endpoint = 'inproc://foo'
  b.bind(endpoint)
  a.connect(endpoint)

  b.createReadStream().on('data', (data) => {
    t.alike(data, Buffer.from('hello world'))
  })

  a.createWriteStream().write('hello world')
})

test('pair socket, inproc, duplex stream', async (t) => {
  t.plan(2)

  const ctx = new Context()

  const a = new PairSocket(ctx)
  t.teardown(() => a.close())

  const b = new PairSocket(ctx)
  t.teardown(() => b.close())

  const endpoint = 'inproc://foo'
  b.bind(endpoint)
  a.connect(endpoint)

  const bs = b.createDuplexStream()
  const as = a.createDuplexStream()

  as.on('data', (data) => {
    t.alike(data, Buffer.from('hello from b'))
  })

  bs.on('data', (data) => {
    t.alike(data, Buffer.from('hello from a'))
  })

  as.write('hello from a')
  bs.write('hello from b')
})

test('pair socket, inproc, threaded', (t) => {
  t.plan(1)

  const ctx = new Context()

  const b = new PairSocket(ctx)
  b.bind('inproc://foo')

  b.readable = true
  b.on('readable', () => {
    const msg = b.receive()
    if (msg === null) return
    t.alike(msg.data, Buffer.from('hello world'))
    b.close()
  })

  const data = ctx.toExternal()

  const thread = Bare.Thread.create(__filename, { data }, (external) => {
    const { Context, PairSocket } = require('..')

    const ctx = Context.from(external)

    const a = new PairSocket(ctx)
    a.connect('inproc://foo')

    a.writable = true
    a.on('writable', () => {
      const sent = a.send('hello world')
      if (sent === false) return
      a.writable = false
      a.close()
    })
  })

  thread.join()
})
