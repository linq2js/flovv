import { createController, delay } from "./index";

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

test("cancel promise", async () => {
  const callback = jest.fn();
  function api() {
    return Object.assign(delay(10), { cancel: callback });
  }

  function* fetchData() {
    yield api();
    return 1;
  }

  const ctrl = createController();
  const flow = ctrl.flow(fetchData);
  flow.start();
  flow.cancel();
  expect(callback).toBeCalled();
  await delay(15);
  expect(flow.data).toBeUndefined();
});
