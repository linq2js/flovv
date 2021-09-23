import { createStore } from "redux";

import { createController } from "../lib";
import { select, dispatch } from "./index";

test("redux store", () => {
  const store = createStore((state: number = 1, action) => {
    if (action.type === "increment") return state + 1;
    if (action.type === "decrement") return state - 1;
    return state;
  });
  const ctrl = createController({
    context: {
      store,
    },
  });
  const result = ctrl
    .flow(function* () {
      const v1: number = yield select((state) => state);
      yield dispatch({ type: "increment" });
      yield dispatch({ type: "increment" });
      const v2: number = yield select((state) => state);
      yield dispatch({ type: "decrement" });
      return v1 + v2;
    })
    .start().data;
  expect(result).toBe(4);
  expect(store.getState()).toBe(2);
});
