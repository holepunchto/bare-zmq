const test = require('brittle')
const { Context, PublisherSocket, SubscriberSocket } = require('..')

test('publisher/subscriber socket, inproc', async (t) => {
  t.plan(2)

  const ctx = new Context()

  const a = new PublisherSocket(ctx)
  t.teardown(() => a.close())

  const b = new SubscriberSocket(ctx)
  t.teardown(() => b.close())

  const endpoint = 'inproc://foo'
  b.bind(endpoint)
  b.subscribe('hello')
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

test('publisher/subscriber socket, inproc, read and write stream', async (t) => {
  t.plan(1)

  const ctx = new Context()

  const a = new PublisherSocket(ctx)
  t.teardown(() => a.close())

  const b = new SubscriberSocket(ctx)
  t.teardown(() => b.close())

  const endpoint = 'inproc://foo'
  b.bind(endpoint)
  b.subscribe('hello')
  a.connect(endpoint)

  b.createReadStream().on('data', (data) => {
    t.alike(data, Buffer.from('hello world'))
  })

  a.createWriteStream().write('hello world')
})
