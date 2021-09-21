import { createTask } from "./index";

test("child task should be cancelled if parent task is cancelled", () => {
  const parent = createTask();
  const child = parent.child();

  expect(child.cancelled).toBeFalsy();
  parent.cancel();
  expect(child.cancelled).toBeTruthy();
});

test("should trigger dispose listener if the task is already disposed", () => {
  const task = createTask();
  const listener = jest.fn();
  task.dispose();
  task.onDispose(listener);
  expect(listener).toBeCalledTimes(1);
  task.onDispose(listener);
  expect(listener).toBeCalledTimes(2);
});

test("should trigger cancel listener if the task is already cancelled", () => {
  const task = createTask();
  const listener = jest.fn();
  task.cancel();
  task.onCancel(listener);
  expect(listener).toBeCalledTimes(1);
  task.onCancel(listener);
  expect(listener).toBeCalledTimes(2);
});
