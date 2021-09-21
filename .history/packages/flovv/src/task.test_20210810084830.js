import { createTask } from "./index";

test("child task should be cancelled if parent task is cancelled", () => {
  const parent = createTask();
  const child = parent.child();

  expect(child.cancelled).toBeFalsy();
  parent.cancel();
  expect(child.cancelled).toBeTruthy();
});
