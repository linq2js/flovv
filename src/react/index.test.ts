import * as React from "react";

import { act, renderHook } from "@testing-library/react-hooks";

import { delay, createController, FlowController } from "../lib";
import { FlowProvider, FlowProviderProps, useFlow } from "./index";

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

function createWrapper(
  props?: Partial<FlowProviderProps>
): [React.FC<{}>, FlowController] {
  const controller = createController();
  return [
    ({ children }) => {
      return React.createElement(
        FlowProvider,
        { controller, ...props },
        children
      );
    },
    controller,
  ];
}

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
