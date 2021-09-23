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

## Examples
