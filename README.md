# bare-zmq

ZeroMQ bindings for JavaScript.

```
npm i bare-zmq
```

In memory of [Pieter Hintjens](https://en.wikipedia.org/wiki/Pieter_Hintjens) :rose:

## Usage

```js
const { Context, PairSocket } = require('bare-zmq')

const ctx = new Context()

const a = new PairSocket(ctx)
a.bind('inproc://foo')

const b = new PairSocket(ctx)
b.connect('inproc://foo')

a.on('data', (msg) => {
  console.log(msg)

  a.destroy()
  b.destroy()
})

b.write('hello world')
```

## License

Apache-2.0
