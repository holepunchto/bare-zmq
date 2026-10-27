const Thread = require('bare-thread')
const { Context, PairSocket } = require('../..')

const ctx = Context.from(Thread.self.data)

const a = new PairSocket(ctx)
a.connect('inproc://foo')

a.writable = true
a.on('writable', () => {
  const sent = a.send('hello world')
  if (sent === false) return
  a.writable = false
  a.close()
})
