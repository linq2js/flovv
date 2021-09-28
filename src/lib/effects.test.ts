import { block, expiry } from ".";
import {
  retry,
  partial,
  debounce,
  on,
  race,
  stale,
  start,
  update,
  merge,
} from "./effects";
import { createController, delay } from "./main";

test("retry (async)", async () => {
  const results = [undefined, undefined, 1];
  async function api() {
    const result = results.shift();
    if (!result) {
      throw new Error("No result");
    }
    return result;
  }

  function* fetchData() {
    const data: number = yield retry(3, api);
    return data;
  }

  const ctrl = createController();
  const flow = ctrl.flow(fetchData);
  flow.start();
  await delay(1);
  expect(flow.data).toBe(1);
});

test("retry (iterator)", () => {
  const results = [undefined, undefined, 1];
  function* api() {
    const result = results.shift();
    if (!result) {
      throw new Error("No result");
    }
    return result;
  }

  function* fetchData() {
    const data: number = yield retry(3, api);
    return data;
  }

  const ctrl = createController();
  const flow = ctrl.flow(fetchData);
  flow.start();
  expect(flow.data).toBe(1);
});

test("partial with wait", async () => {
  function* fetchData() {
    yield delay(10);
    const result: number = yield partial(1, true);
    return result;
  }

  const ctrl = createController();
  const flow = ctrl.flow(fetchData);
  flow.start();
  expect(flow.running).toBeTruthy();
  expect(flow.hasData).toBeFalsy();
  expect(flow.data).toBeUndefined();
  await delay(15);
  expect(flow.completed).toBeTruthy();
  expect(flow.hasData).toBeTruthy();
  expect(flow.data).toBe(1);
  await delay(15);
  expect(flow.completed).toBeTruthy();
  expect(flow.hasData).toBeTruthy();
  expect(flow.data).toBe(1);
  flow.next(2);
  expect(flow.completed).toBeTruthy();
  expect(flow.hasData).toBeTruthy();
  expect(flow.data).toBe(2);
});

test("partial without wait", async () => {
  function* fetchData() {
    yield delay(10);
    yield partial(1);
    yield delay(10);
    yield partial(2);
    yield delay(10);
    return 3;
  }

  const ctrl = createController();
  const flow = ctrl.flow(fetchData);
  flow.start();
  expect(flow.running).toBeTruthy();
  expect(flow.hasData).toBeFalsy();
  expect(flow.data).toBeUndefined();
  await delay(12);
  expect(flow.running).toBeTruthy();
  expect(flow.hasData).toBeTruthy();
  expect(flow.data).toBe(1);
  await delay(12);
  expect(flow.running).toBeTruthy();
  expect(flow.hasData).toBeTruthy();
  expect(flow.data).toBe(2);
  await delay(12);
  expect(flow.completed).toBeTruthy();
  expect(flow.hasData).toBeTruthy();
  expect(flow.data).toBe(3);
});

test("restart", async () => {
  const results = [2, 1];
  function* fetchData() {
    yield delay(10);
    return results.pop();
  }
  const ctrl = createController();
  const flow = ctrl.flow(fetchData);

  flow.current.restart();
  await delay(15);
  expect(flow.current.data).toBe(1);
  flow.current.restart();
  await delay(15);
  expect(flow.current.data).toBe(2);
});

test("on without listener", () => {
  const callback = jest.fn();
  function* fetchData() {
    yield on("start");
    callback();
  }
  const ctrl = createController();
  ctrl.flow(fetchData).start();
  expect(callback).toBeCalledTimes(0);
  ctrl.emit("start");
  expect(callback).toBeCalledTimes(1);
});

test("race", async () => {
  const callback = jest.fn();
  function* fetchData() {
    const result: { cancel: any } = yield race({
      cancel: on("cancel"),
      debounce: delay(10),
    });
    if ("cancel" in result) {
      callback();
    }
  }
  const ctrl = createController();
  ctrl.flow(fetchData).restart();
  expect(callback).toBeCalledTimes(0);
  await delay(15);
  expect(callback).toBeCalledTimes(0);

  ctrl.flow(fetchData).restart();
  ctrl.emit("cancel");
  expect(callback).toBeCalledTimes(1);
});

test("update by flowFn", () => {
  const ctrl = createController();
  const countFlow = () => {
    return 1;
  };
  function* updateFlow() {
    yield update(countFlow, 2);
  }
  expect(ctrl.flow(countFlow).start().data).toBe(1);
  ctrl.flow(updateFlow).start();
  expect(ctrl.flow(countFlow).start().data).toBe(2);
});

test("update by key", () => {
  const ctrl = createController();
  const countFlow = () => {
    return 1;
  };
  function* updateFlow() {
    yield update("count", 2);
  }
  expect(ctrl.flow("count", countFlow).start().data).toBe(1);
  ctrl.flow(updateFlow).start();
  expect(ctrl.flow("count")?.data).toBe(2);
});

test("stale on specified event", () => {
  function* fetchData() {
    yield stale("when", "doSomething");
    return Math.random();
  }
  const ctrl = createController();
  const v1 = ctrl.flow(fetchData).start().data;
  const v2 = ctrl.flow(fetchData).start().data;
  expect(v1).toBe(v2);
  ctrl.emit("doSomething");
  const v3 = ctrl.flow(fetchData).start().data;
  expect(v1).not.toBe(v3);
});

test("stale on time", async () => {
  function* fetchData() {
    yield stale("when", 10);
    return Math.random();
  }
  const ctrl = createController();
  const v1 = ctrl.flow(fetchData).start().data;
  await delay(15);
  const v2 = ctrl.flow(fetchData).start().data;
  expect(v1).not.toBe(v2);
});

test("stale on flow updated", () => {
  function* fetchData() {
    yield stale("when", "doSomething");
    return Math.random();
  }
  function* dependentFlow() {
    yield stale("flow", fetchData);
    const data: number = yield start(fetchData);
    return data * 2;
  }
  const ctrl = createController();
  const v1 = ctrl.flow(dependentFlow).start().data;
  const v2 = ctrl.flow(dependentFlow).start().data;
  expect(v1).toBe(v2);
  ctrl.emit("doSomething");
  expect(ctrl.flow(fetchData).stale).toBeTruthy();
  expect(ctrl.flow(dependentFlow).stale).toBeTruthy();
  const v3 = ctrl.flow(dependentFlow).start().data;
  expect(v1).not.toBe(v3);
});

test("debounce", async () => {
  const results = [1, 2, 3, 4];
  function* fetchData() {
    yield debounce(10);
    return results.shift();
  }
  const ctrl = createController();
  ctrl.flow(fetchData).restart();
  ctrl.flow(fetchData).restart();
  ctrl.flow(fetchData).restart();
  ctrl.flow(fetchData).restart();
  await delay(15);
  expect(ctrl.flow(fetchData).data).toBe(1);
});

test("merge", () => {
  function* fetchData() {
    yield merge((current) => {
      return current * 2;
    });
    return 1;
  }
  const ctrl = createController();
  expect(ctrl.flow(fetchData).start().data).toBe(2);
});

test("expiry", async () => {
  function* fetchData() {
    yield expiry(10);
    return Math.random();
  }
  const ctrl = createController();
  const flow = ctrl.flow(fetchData);
  const v1 = flow.start().data;
  await delay(100);
  const v2 = flow.start().data;
  expect(v1).not.toBe(v2);
});

test("block", async () => {
  const results = [1, 2, 3];
  function* fetchData() {
    // block flow until it completed
    yield block();
    yield delay(10);
    return results.shift();
  }
  const ctrl = createController();
  const flow = ctrl.flow(fetchData);
  flow.restart();
  flow.restart();
  flow.restart();
  await delay(15);
  expect(flow.data).toBe(1);
});

test("throttle", async () => {
  const results = [1, 2, 3];
  function* fetchData() {
    // block flow until it completed
    yield block(15);
    return 1;
  }
  const ctrl = createController();
  const flow = ctrl.flow(fetchData);
  flow.restart();
  flow.restart();
  flow.restart();
  expect(flow.data).toBe(1);
  await delay(5);
  flow.restart();
  flow.restart();
  flow.restart();
  expect(flow.data).toBe(1);
});
