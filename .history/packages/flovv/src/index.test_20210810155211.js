import flovv from "./index";

test("initial state", () => {
  const store = flovv({ state: { state1: 1, state2: 2 } });
  expect(store.state).toEqual({ state1: 1, state2: 2 });
});

test("get state by flow", () => {
  const store = flovv({ state: { state1: 1, state2: 2 } });
  function* mainFlow() {
    return yield { get: "state1" };
  }
  expect(store.start(mainFlow)).toBe(1);
});

test("get state by flow (dependency state)", () => {
  const store = flovv({ state: { state1: 1, state2: 2 } });
  function* mainFlow() {
    return yield { get: "@state1" };
  }
  expect(store.start(mainFlow)).toBe(1);
});

test("flow data is cached until it is stale", () => {
  const store = flovv({ state: { state1: 1, state2: 2 } });
  const callback = jest.fn();
  function* mainFlow() {
    callback();
    const state1 = yield { get: "state1" };
    return state1 * 2;
  }
  expect(store.start(mainFlow)).toBe(2);
  expect(store.start(mainFlow)).toBe(2);
  expect(callback).toHaveBeenCalledTimes(1);
});
