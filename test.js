const test = require('brittle')
const { Context, PairSocket } = require('.')

test('create context', (t) => {
  const ctx = new Context()
  ctx.destroy()
  t.pass()
})

test('pair socket', (t) => {
  t.plan(1)
  const ctx = new Context()

  const a = new PairSocket(ctx)
  a.bind('inproc://foo')

  const b = new PairSocket(ctx)
  b.connect('inproc://foo')

  a.on('data', (msg) => {
    t.alike(msg, Buffer.from('hello world'))

    a.destroy()
    b.destroy()
  })

  b.write('hello world')
})
