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
    () => useFlow(sum, { args: [1, 2, 3] }).start().data,
    { wrapper }
  );

  expect(result.current).toBe(6);
});
