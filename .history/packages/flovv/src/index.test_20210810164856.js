import flovv from "./index";
import { delay } from "./utils";
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
    const state1 = yield { get: "@state1" };
    return state1 * 2;
  }
  function* updateState1() {
    yield { set: { state1: 2 } };
  }
  expect(store.start(mainFlow)).toBe(2);
  expect(store.start(mainFlow)).toBe(2);
  expect(callback).toBeCalledTimes(1);
  store.start(updateState1);
  expect(store.flow(mainFlow).stale).toBeTruthy();
  expect(store.start(mainFlow)).toBe(4);
  expect(store.start(mainFlow)).toBe(4);
  expect(callback).toBeCalledTimes(2);
});

test("update async state parallelly", async () => {
  const store = flovv({ state: { state1: 1 } });
  function* update1() {
    yield { set: { state1: delay(10, 2) } };
  }
  function* update2() {
    yield { set: { state1: delay(15, 3) } };
  }
  function* mainFlow() {
    yield { fork: [update1(), update2()] };
  }
  store.start(mainFlow);
  expect(store.state.state1).toBe(1);
  await delay(20);
  expect(store.state.state1).toBe(3);
});

test("update async state serially", async () => {
  const store = flovv({ state: { state1: 1 } });

  function* mainFlow() {
    yield { set: { state1: delay(10, 2) } };
    yield { set: { state1: delay(15, 3) } };
  }
  store.start(mainFlow);
  expect(store.state.state1).toBe(2);
  await delay(15);
  expect(store.state.state1).toBe(3);
});
