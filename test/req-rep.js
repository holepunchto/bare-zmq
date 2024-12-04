const test = require('brittle')
const { Context, RequestSocket, ReplySocket } = require('..')

test('request/reply socket, inproc', async (t) => {
  t.plan(4)

  const ctx = new Context()

  const a = new ReplySocket(ctx)
  t.teardown(() => a.close())

  const b = new RequestSocket(ctx)
  t.teardown(() => b.close())

  const endpoint = 'inproc://foo'
  a.bind(endpoint)
  b.connect(endpoint)

  a.readable = true
  a.on('readable', () => {
    const msg = a.receive()
    if (msg === null) return
    t.alike(msg.data, Buffer.from('request from b'))
    a.readable = false

    a.writable = true
    a.on('writable', () => {
      const sent = a.send('reply from a')
      if (sent === false) return
      t.is(sent, true)
      a.writable = false
    })
  })

  b.writable = true
  b.on('writable', () => {
    const sent = b.send('request from b')
    if (sent === false) return
    t.is(sent, true)
    b.writable = false

    b.readable = true
    b.on('readable', () => {
      const msg = b.receive()
      if (msg === null) return
      t.alike(msg.data, Buffer.from('reply from a'))
      b.readable = false
    })
  })
})
