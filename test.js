const test = require('brittle')
const { Context, PairSocket, PublisherSocket, SubscriberSocket } = require('.')

test('create context', (t) => {
  new Context()
  t.pass()
})

test('pair socket', (t) => {
  t.plan(1)
  const ctx = new Context()

  const endpoint = 'inproc://foo'

  const a = new PairSocket(ctx)
  a.bind(endpoint)

  const b = new PairSocket(ctx)
  b.connect(endpoint)

  a.on('data', (msg) => {
    t.alike(msg, Buffer.from('hello world'))

    a.destroy()
    b.destroy()
  })

  b.write('hello world')
})

test('publisher/subscriber socket', (t) => {
  t.plan(1)
  const ctx = new Context()

  const endpoint = 'tcp://127.0.0.1:5556'

  const a = new PublisherSocket(ctx)
  a.bind(endpoint)

  const b = new SubscriberSocket(ctx)
  b.connect(endpoint)
  b.subscribe('hello')

  b.on('data', (msg) => {
    t.alike(msg, Buffer.from('hello world'))

    a.destroy()
    b.destroy()
  })

  setTimeout(() => a.write('hello world'), 10)
})
