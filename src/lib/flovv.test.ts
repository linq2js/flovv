import { update } from "./effects";
import { createController, delay, on, race } from "./index";

test("simple generator", async () => {
  const results = [1];
  function* fetchData() {
    yield delay(10);
    return results.pop();
  }
  const ctrl = createController();
  const flow = ctrl.flow(fetchData);

  flow.current.start();
  await delay(15);
  expect(flow.current.data).toBe(1);
  flow.current.start();
  await delay(15);
  expect(flow.current.data).toBe(1);
});

test("cancellation", async () => {
  function* fetchData() {
    yield delay(10);
    return 1;
  }
  const ctrl = createController();
  const flow = ctrl.flow(fetchData);

  flow.current.start();
  flow.current.cancel();
  expect(flow.current.cancelled).toBeTruthy();
  await delay(15);
  expect(flow.current.data).toBeUndefined();
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
