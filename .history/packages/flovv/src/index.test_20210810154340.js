import flovv from "./index";

test("initial state", () => {
  const store = flovv({ state: { state1: 1, state2: 2 } });
  expect(store.state).toEqual({ state1: 1, state2: 2 });
});

test("get state by flow", () => {
  const store = flovv({ state: { state1: 1, state2: 2 } });
  function* Flow() {
    return yield { get: "state1" };
  }
  const f = store.flow(Flow);
  f.start();
  expect(f.data).toBe(1);
});

test("get state by flow (dependency state)", () => {
  const store = flovv({ state: { state1: 1, state2: 2 } });
  function* Flow() {
    return yield { get: "$state1" };
  }
  const f = store.flow(Flow);
  f.start();
  expect(f.data).toBe(1);
});
