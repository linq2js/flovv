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

test("ref: flow", async () => {
  const store = flovv({ state: { value: 1 } });

  function* updateFlow() {
    yield { set: { value: 2 } };
  }
  function* getValue() {
    yield { delay: 10 };
    return yield { ref: "value" };
  }
  function* doubleValue() {
    const value = yield { ref: getValue };
    return value * 2;
  }

  const doubleValueFlow = store.flow(doubleValue);

  await doubleValueFlow.start();

  expect(doubleValueFlow.data).toBe(2);

  store.start(updateFlow);

  await doubleValueFlow.start();
  // console.log(store.state, store.flow(getValue).data);
  expect(doubleValueFlow.data).toBe(4);
});

test("get state by flow (dependency state)", () => {
  const store = flovv({ state: { state1: 1, state2: 2 } });
  function* mainFlow() {
    return yield { ref: "state1" };
  }
  expect(store.start(mainFlow)).toBe(1);
});

test("flow data is cached until it is stale", () => {
  const store = flovv({ state: { state1: 1, state2: 2 } });
  const callback = jest.fn();
  function* mainFlow() {
    callback();
    const state1 = yield { ref: "state1" };
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
  await delay(15);
  expect(store.state.state1).toBe(2);
  await delay(15);
  expect(store.state.state1).toBe(3);
});

test("once", async () => {
  const callback = jest.fn();
  const store = flovv();
  function* aaa() {
    yield { delay: 10 };
    callback("a");
  }
  function* bbb() {
    yield { delay: 5 };
    callback("b");
  }
  function* mainFlow() {
    yield { once: [bbb, aaa, aaa, bbb] };
  }
  store.start(mainFlow);
  await delay(30);
  expect(callback.mock.calls).toEqual([["b"], ["a"]]);
});

test("debounce", async () => {
  const callback = jest.fn();
  const store = flovv();
  function* mainFlow() {
    yield {
      debounce: {
        ms: 10,
        when: "search",
        flow: { call: callback },
      },
    };
  }
  store.start(mainFlow);
  store.emit("search");
  store.emit("search");
  await delay(5);
  store.emit("search");
  store.emit("search");
  await delay(15);
  expect(callback).toBeCalledTimes(1);
});

test("throttle", async () => {
  const callback = jest.fn();
  const store = flovv();
  function* mainFlow() {
    yield {
      throttle: {
        ms: 15,
        when: "search",
        flow: { call: callback },
      },
    };
  }
  store.start(mainFlow);
  store.emit("search");
  store.emit("search");
  await delay(10);
  store.emit("search");
  store.emit("search");
  await delay(20);
  store.emit("search");
  expect(callback).toBeCalledTimes(2);
});

test("yield on", () => {
  const callback = jest.fn();
  const store = flovv();
  function* mainFlow() {
    yield { on: { click: { call: callback } } };
  }
  store.start(mainFlow);
  store.emit("click");
  store.emit("click");
  store.emit("click");
  expect(callback).toBeCalledTimes(3);
});

test("yield select", () => {
  const callback = jest.fn();
  const store = flovv({ state: { a: 1, b: 2 } });
  const sum = ({ a, b }) => a + b;
  function* mainFlow() {
    callback(yield { select: sum });
    yield { set: { a: 2 } };
    callback(yield { select: sum });
    callback(yield { select: [(state) => state.a, (state) => state.b] });
  }
  store.start(mainFlow);
  expect(callback.mock.calls).toEqual([[3], [4], [[2, 2]]]);
});

test("yield cancel previous", async () => {
  const callback = jest.fn();
  const store = flovv();
  function* mainFlow() {
    yield { cancel: "previous" };
    yield { delay: 15 };
    callback();
  }
  store.restart(mainFlow);
  store.restart(mainFlow);
  await delay(20);
  expect(callback).toBeCalledTimes(1);
});

test("yield context", () => {
  const callback = jest.fn();
  const store = flovv({ context: { a: 1, b: 2, c: 3 } });
  function* mainFlow() {
    yield { context: { a: 2, c: 5 } };
    callback(yield { context: "a" }, yield { context: ["b", "c"] });
  }
  store.start(mainFlow);
  expect(callback.mock.calls).toEqual([[2, [2, 5]]]);
});

test("store ready", async () => {
  const callback = jest.fn();
  function* mainFlow() {
    yield { delay: 10 };
    yield { get: "something" };
  }
  const store = flovv({ init: mainFlow });
  store.ready(callback);
  await delay(15);
  expect(callback).toBeCalledTimes(1);
});

test("store not ready", async () => {
  const callback = jest.fn();
  function* mainFlow() {
    yield { delay: 10 };
    throw new Error("fail");
  }
  const store = flovv({ init: mainFlow });
  store.ready(callback);
  await delay(20);
  expect(callback).toBeCalledTimes(0);
  expect(store.error.message).toBe("fail");
});

test("kyed flow", () => {
  function* getValue(payload, key) {
    return yield { get: key };
  }
  const store = flovv({ state: { v1: 1, v2: 2 } });
  const f1 = store.flow(getValue, ["v1"]).start();
  const f2 = store.flow(getValue, ["v2"]).start();

  expect(f1).not.toBe(f2);
  expect(f1.data).toBe(1);
  expect(f2.data).toBe(2);
});

test("invalidate: events", () => {
  function* getRemoteData() {
    yield { invalidate: "changed" };
    return Math.random();
  }
  const store = flovv();
  const v1 = store.flow(getRemoteData).start().data;
  const v2 = store.flow(getRemoteData).start().data;

  expect(v1).toBe(v2);
  store.emit("changed");

  const v3 = store.flow(getRemoteData).start().data;

  expect(v3).not.toBe(v1);
});

test("invalidate: handlers", () => {
  function* getRemoteData() {
    yield {
      invalidate: (e) => {
        console.log(e);
        return e.type === "changed1" || e.type === "changed2";
      },
    };
    return Math.random();
  }
  const store = flovv();
  const v1 = store.flow(getRemoteData).start().data;
  const v2 = store.flow(getRemoteData).start().data;

  expect(v1).toBe(v2);
  store.emit("changed1");
  store.emit("changed2");

  const v3 = store.flow(getRemoteData).start().data;

  expect(v3).not.toBe(v1);
});

test("ref: flow selector", () => {
  function* getData() {
    yield { ref: { flow: valueFlow, select: (data) => data.value } };
    return Math.random();
  }

  function* valueFlow(props) {
    yield { get: "something" };
    return {
      value: 1,
      ...props,
    };
  }

  const store = flovv();
  const v1 = store.start(getData);
  const v2 = store.start(getData);
  expect(v1).toBe(v2);
  store.restart(valueFlow, { a: 1, b: 2 });
  const v3 = store.start(getData);
  expect(v1).toBe(v3);
  store.restart(valueFlow, { value: 2 });
  const v4 = store.start(getData);
  expect(v1).not.toBe(v4);
});

test("ref: state selectors", () => {
  function* getRemoteData() {
    yield { ref: { select: (state) => state.value } };
    return Math.random();
  }

  function* updateState(state) {
    yield { set: state };
  }

  const store = flovv();
  const v1 = store.flow(getRemoteData).start().data;
  const v2 = store.flow(getRemoteData).start().data;
  expect(v1).toBe(v2);

  store.flow(updateState).restart({ data: 1 });
  const v3 = store.flow(getRemoteData).start().data;
  expect(v1).toBe(v3);

  store.flow(updateState).restart({ value: 1 });
  const v4 = store.flow(getRemoteData).start().data;
  expect(v3).not.toBe(v4);

  store.flow(updateState).restart({ value: 1 });
  const v5 = store.flow(getRemoteData).start().data;
  expect(v4).toBe(v5);
});

test("handle error", async () => {
  const callback = jest.fn();
  async function throwError() {
    await delay(10);
    throw new Error("invalid");
  }
  function* mainFlow() {
    try {
      yield { call: throwError };
    } catch (e) {
      callback(e);
    }
  }
  const store = flovv();
  store.start(mainFlow);
  await delay(20);
  expect(callback).toBeCalledTimes(1);
});

test("handle error for forked task", async () => {
  const callback = jest.fn();
  async function throwError() {
    await delay(10);
    throw new Error("invalid");
  }
  function* mainFlow() {
    const forkedTask = yield { fork: { call: throwError } };
    yield { error: [callback, forkedTask] };
  }
  const store = flovv();
  store.start(mainFlow);
  await delay(20);
  expect(callback).toBeCalledTimes(1);
});

test("custom context", () => {
  const callback = jest.fn();
  function* mainFlow() {
    const value = yield { context: "value" };
    callback(value);
  }
  const store = flovv();
  store.restart(mainFlow);
  store.restart(mainFlow, undefined, { context: { value: 1 } });
  store.restart(mainFlow, undefined, { context: { value: 2 } });
  expect(callback.mock.calls).toEqual([[undefined], [1], [2]]);
});

test("partial", () => {
  const callback = jest.fn();
  function* mainFlow() {
    yield { partial: 1 };
    yield { partial: 2 };
    yield { partial: 3 };
  }
  const store = flovv();
  const flow = store.flow(mainFlow);
  flow.watch((e) => e.status === "partial" && callback(e.data));
  flow.start();
  expect(callback).toBeCalledTimes(3);
});

test("exit: first run", () => {
  const results = [1, 2, 3];
  function* mainFlow() {
    yield { exit: true };
    return results.shift();
  }
  const store = flovv();
  expect(store.restart(mainFlow)).toBe(1);
});

test("exit: second run", () => {
  const results = [1, 2, 3];
  function* mainFlow() {
    yield { exit: true };
    return results.shift();
  }
  const store = flovv();

  expect(store.restart(mainFlow)).toBe(1);
  expect(store.restart(mainFlow)).toBe(1);
});
