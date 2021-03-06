import { on } from "./effects";
import { createController, delay } from "./index";
import { EffectContext } from "./main";

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

test("run", async () => {
  const callback = jest.fn();
  function* fetchData(result: number) {
    callback();
    return result;
  }
  const ctrl = createController();
  await expect(ctrl.run(fetchData, 1)).resolves.toBe(1);
  await expect(ctrl.run(fetchData, 2)).resolves.toBe(2);
  expect(callback).toBeCalledTimes(2);
});

test("effect context: end", () => {
  const effect = (ec: EffectContext) => {
    ec.end(1);
  };
  function* fetchData() {
    yield effect;
    return 2;
  }
  const ctrl = createController();
  expect(ctrl.start(fetchData).data).toBe(1);
});

test("effect context: fail", () => {
  const effect = (ec: EffectContext) => {
    ec.fail(new Error("invalid"));
  };
  function* fetchData() {
    yield effect;
    return 2;
  }
  const ctrl = createController();
  expect(ctrl.start(fetchData).error?.message).toBe("invalid");
});

test("handle event", () => {
  const results: number[] = [];
  function handler1(e: any) {
    results.push(e);
  }

  function handler2(value: number) {
    results.push(value);
  }

  function* boostrap() {
    yield on("1", handler1);
    yield on("2", handler2);
  }

  const ctrl = createController();
  ctrl.start(boostrap);
  ctrl.emit("1", 1);
  ctrl.emit("1", 2);
  ctrl.emit("2", 3);

  expect(results).toEqual([1, 2, 3]);
});
