# bare-zmq

Low-level ZeroMQ bindings for JavaScript.

```
npm i bare-zmq
```

In memory of [Pieter Hintjens](https://en.wikipedia.org/wiki/Pieter_Hintjens) :rose:

## Usage

```js
const { Context, PairSocket } = require('bare-zmq')

const ctx = new Context()

const a = new PairSocket(ctx)
const b = new PairSocket(ctx)

const endpoint = 'inproc://foo'
b.bind(endpoint)
a.connect(endpoint)

b.readable = true
b.on('readable', () => {
  const msg = b.receive()
  if (msg === null) return
  console.log(msg)
})

a.writable = true
a.on('writable', () => {
  const sent = a.send('hello world')
  if (sent === false) return
  a.writable = false
})
```

## License

Apache-2.0
