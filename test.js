const test = require('brittle')
const { Context, PairSocket } = require('.')

test('create context', (t) => {
  new Context()
  t.pass()
})

test('close context', async (t) => {
  const ctx = new Context()
  await t.execution(ctx.close())
})

test('close context with socket', async (t) => {
  const ctx = new Context()

  const a = new PairSocket(ctx)
  const closing = ctx.close()

  await a.close()
  await t.execution(closing)
})

test('socket endpoint, inproc', async (t) => {
  const ctx = new Context()

  const a = new PairSocket(ctx)
  a.bind('inproc://foo')

  t.comment(a.endpoint)

  await a.close()
  await ctx.close()
})

test('socket endpoint, tcp', async (t) => {
  const ctx = new Context()

  const a = new PairSocket(ctx)
  a.bind('tcp://127.0.0.1:*')

  t.comment(a.endpoint)

  await a.close()
  await ctx.close()
})

require('./test/pair')
require('./test/pub-sub')
require('./test/req-rep')
