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

b.createReadStream().on('data', console.log)
a.createWriteStream().write('hello world')
```

## License

Apache-2.0
