# FLOVV

A library for controlling app flows with ease

## Installation

**NPM**

```bash
npm i flovv --save
```

**YARN**

```bash
yarn add flovv
```

## React Bindings

## Redux Bindings

```js
import { createController } from "flovv";
import { select, dispatch } from "flovv/redux";
import { createStore } from "redux";

const store = createStore((state = 0, { type }) => {
  if (type === "increment") return state + 1;
  return state;
});
function* Increment() {
  const count = yield select((state) => state);
  yield dispatch({ type: "increment" });
}
```

## API References

### Effects

#### retry(times, fn, ...args)

#### remove(key)

#### debounce(ms)

#### cancel()

#### cancel(cancellable)

#### cancel(key)

#### cancel(flow)

#### stale("when", promise)

#### stale("when", timeout)

#### stale("when", event, \[checkFn])

#### stale("flow", flows, \[checkFn])

#### partial(data)

#### partial(data, wait)

#### on(event)

#### on(event, flow, ...args)

## Examples

- [Load More / Infinite Scroll](https://codesandbox.io/s/flovv-reddit-infinite-demo-nnq70?file=/src/App.js)
- [Caching, Auto Refresh](https://codesandbox.io/s/flovv-reddit-demo-nc5fw?file=/src/App.js)
- [Star Wars API](https://codesandbox.io/s/flovv-start-war-demo-76z7b?file=/src/App.js)
- [The Rick and Morty API](https://codesandbox.io/s/flovv-the-rick-and-morty-api-gyrgf?file=/src/App.js)
