import { createTask } from "./index";

test("child task should be cancelled if parent task is cancelled", () => {
  const parent = createTask();
  const child = parent.child();

  expect(child.cancelled).toBeFalsy();
  parent.cancel();
  expect(child.cancelled).toBeTruthy();
});

test("should trigger onDispose listener if the task is already disposed", () => {
  const task = createTask();
  const f = jest.fn();
  task.dispose();
  task.onDispose(f);
});
