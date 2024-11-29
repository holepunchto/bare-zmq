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

require('./test/pair')
require('./test/pub-sub')
