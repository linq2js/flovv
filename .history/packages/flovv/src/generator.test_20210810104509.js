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

test("fork: single", () => {
  const callback = jest.fn();
  function* task1() {
    yield { delay: 10 };
    callback();
  }
  function* task2() {
    yield { delay: 5 };
    callback();
  }
  function* flow() {
    yield { fork: task1() };

    yield { fork: task2() };
    callback();
  }
});

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
