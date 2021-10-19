import { act, renderHook } from "@testing-library/react-hooks";

import { delay } from "../lib";
import { useFlow } from "./index";
import { createWrapper } from "./testUtils";

test("simple flow", async () => {
  function* getCount() {
    yield delay(10);
    return 1;
  }
  const [wrapper] = createWrapper();
  const { result } = renderHook(() => useFlow(getCount).start(), { wrapper });
  expect(result.current.running).toBeTruthy();
  await act(() => delay(15));
  expect(result.current.running).toBeFalsy();
  expect(result.current.data).toBe(1);
});

test("default args", () => {
  function sum(a: number, b: number, c: number) {
    return a + b + c;
  }
  const [wrapper] = createWrapper();
  const { result } = renderHook(
    () => useFlow(["sum", 1, 2, 3], sum).start().data,
    { wrapper }
  );

  expect(result.current).toBe(6);
});

test("default flow (function)", () => {
  function defaultFlow(key: string, value: number = 1) {
    return key + value;
  }
  const [wrapper] = createWrapper({ defaultFlow });
  const { result } = renderHook(
    () => {
      const a = useFlow("a").start().data;
      const b = useFlow(["b"]).start().data;
      const c = useFlow(["c", 2]).start().data;
      const d = useFlow("d").start(3).data;
      const e = useFlow("e").start(4).data;
      return [a, b, c, d, e];
    },
    { wrapper }
  );

  expect(result.current).toEqual(["a1", "b1", "c2", "d3", "e4"]);
});

test("default flow (hash)", () => {
  const [wrapper] = createWrapper({
    defaultFlow: { sum: (a, b) => a + b, mul: (a, b) => a * b },
  });
  const { result } = renderHook(
    () => {
      const sum = useFlow(["sum", 1, 2]).start().data;
      const mul = useFlow("mul").start(1, 2).data;

      return [sum, mul];
    },
    { wrapper }
  );

  expect(result.current).toEqual([3, 2]);
});

test("idle", () => {
  const [wrapper] = createWrapper();
  const { result } = renderHook(() => useFlow(() => 1), { wrapper });
  expect(result.current.idle).toBeTruthy();
});

test("default data", async () => {
  const [wrapper] = createWrapper();
  function* fetchData() {
    yield delay(10);
    return 1;
  }
  const { result } = renderHook(
    () => useFlow(fetchData, { defaultData: 2 }).start().data,
    { wrapper }
  );
  expect(result.current).toBe(2);
  await act(() => delay(15));
  expect(result.current).toBe(1);
});

// test("using deps", () => {
//   const [wrapper] = createWrapper();
//   function* fetchData(data: number) {
//     return data;
//   }
//   let testData = Math.random();
//   const { result, rerender } = renderHook(
//     () => useFlow(fetchData, [testData]).data,
//     { wrapper }
//   );
//   expect(result.current).toBe(testData);
//   // second try
//   testData = Math.random();
//   rerender();
//   expect(result.current).toBe(testData);
//   // third try
//   testData = Math.random();
//   rerender();
//   expect(result.current).toBe(testData);
// });

test("type inferring", async () => {
  const [wrapper] = createWrapper();
  function* getItem(key: string) {
    const value: string = yield Promise.resolve(key);
    return value;
  }
  function* NavigationState() {
    const savedState: string = yield getItem("aaaa");
    return savedState;
  }

  const { result } = renderHook(() => useFlow(NavigationState).tryGet(""), {
    wrapper,
  });

  function print(data: string) {}

  print(result.current);

  await act(() => delay(10));
});
