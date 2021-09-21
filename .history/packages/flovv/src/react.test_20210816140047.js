import { renderHook } from "@testing-library/react-hooks";

import { useFlow } from "./react";
import { createWrapper, delayedAct } from "./utils";
test("", () => {
  const callback = jest.fn();
  const [wrapper, store] = createWrapper({ state: { value: 1 } });
  const selectValue = (key) => (state) => state[key];
  function* updateValue() {
    yield { set: { value: 2 } };
  }
  const { result } = renderHook(
    () => {
      callback();
      return useFlow(selectValue).start("value").data;
    },
    { wrapper }
  );
  expect(result.current).toBe(1);
  expect(callback).toBeCalledTimes(1);

  delayedAct(() => {
    store.run(updateValue);
  });

  expect(callback).toBeCalledTimes(2);
  expect(result.current).toBe(2);
});
