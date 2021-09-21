import { createTask } from ".";
import { processFlow } from "./index";

test("delay: success", async () => {
  const callback = jest.fn();
  function* flow() {
    yield { delay: 10 };
    callback();
  }
  processFlow(flow());
  expect(callback).toBeCalledTimes(0);
  await delay(15);
  expect(callback).toBeCalledTimes(1);
});

test("delay: cancelled", async () => {
  const callback = jest.fn();
  function* flow() {
    yield { delay: 10 };
    callback();
  }
  const task = createTask();
  processFlow(flow(), undefined, undefined, task);
  expect(callback).toBeCalledTimes(0);
  task.cancel();
  await delay(15);
  expect(callback).toBeCalledTimes(0);
});

test("fork: single", async () => {
  const callback = jest.fn();
  function* task1() {
    yield { delay: 10 };
    callback(4);
  }
  function* task2() {
    yield { delay: 5 };
    callback(3);
  }
  function* flow() {
    yield { fork: task1() };
    callback(1);
    yield { fork: task2() };
    callback(2);
  }
  processFlow(flow());
  await delay(15);
  expect(callback.mock.calls).toEqual([[1], [2], [3], [4]]);
});

test("fork: array", async () => {
  const callback = jest.fn();
  function* task1() {
    yield { delay: 5 };
    callback(1);
  }
  function* task2() {
    yield { delay: 10 };
    callback(2);
  }
  function* flow() {
    const result = yield { fork: [task1(), task2()] };
    callback(Array.isArray(result), typeof result[0], typeof result[1]);
  }
  processFlow(flow());
  await delay(15);
  expect(callback.mock.calls).toEqual([[true, "object", "object"], [1], [2]]);
});

test("fork: object", async () => {
  const callback = jest.fn();
  function* task1() {
    yield { delay: 5 };
    callback(1);
  }
  function* task2() {
    yield { delay: 10 };
    callback(2);
  }
  function* flow() {
    const result = yield { fork: { task1: task1(), task2: task2() } };
    callback(
      Array.isArray(result),
      typeof result,
      typeof result.task1,
      typeof result.task2
    );
  }
  processFlow(flow());
  await delay(15);
  expect(callback.mock.calls).toEqual([
    [false, "object", "object", "object"],
    [1],
    [2],
  ]);
});

test("fork: error", async () => {
  const callback = jest.fn();
  const onError = jest.fn();
  function* task1() {
    yield { delay: 5 };
    throw new Error("Task1Error");
  }
  function* task2() {
    yield { delay: 5 };
    callback(2);
  }
  function* flow() {
    yield { fork: [task1(), task2()] };
    yield { delay: 10 };
    callback();
  }
  const task = createTask(undefined, undefined, onError);
  processFlow(flow(), undefined, undefined, task);
  await delay(15);
  expect(callback).toBeCalledTimes(1);
  expect(onError).toBeCalledTimes(1);
  expect(task.error.message).toBe("Task1Error");
});

test("fork: cancelling forking task is not affected to forked tasks", async () => {
  const callback = jest.fn();
  function* task1() {
    yield { delay: 5 };
    callback(1);
  }
  function* task2() {
    yield { delay: 5 };
    callback(2);
  }
  function* flow() {
    yield { fork: [task1(), task2()] };
    yield { delay: 10 };
  }
  const task = createTask();
  processFlow(flow(), undefined, undefined, task);
  task.cancel();
  await delay(15);
  expect(callback).toBeCalledTimes(2);
});

test("all", async () => {
  const callback = jest.fn();
  function* flow() {
    yield { all: [delay(5).then(callback), delay(10).then(callback)] };
    callback("done");
  }
  processFlow(flow());
  expect(callback).toBeCalledTimes(0);
  await delay(8);
  expect(callback).toBeCalledTimes(1);
  await delay(15);
  expect(callback).toBeCalledTimes(2);
});

const delay = (ms, value) =>
  new Promise((resolve) => setTimeout(resolve, ms, value));
