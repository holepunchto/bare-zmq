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

a.bind(endpoint)
b.connect(endpoint)

a.createReadStream().on('data', console.log)
b.createWriteStream().write('hello world')
```

## License

Apache-2.0
