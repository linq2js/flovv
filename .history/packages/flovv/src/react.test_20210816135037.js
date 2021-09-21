import { renderHook } from "@testing-library/react-hooks";
import flovv from "./index";
import { useFlow } from "./react";

test("", () => {
  const callback = jest.fn();
  const store = flovv({ state: { value: 1 } });
  const selectValue = (key) => (state) => state[key];
  function* updateValue() {
    yield { set: { value: 2 } };
  }
  const { result } = renderHook(() => {
    callback();
    return useFlow(selectValue).start("value").data;
  });
  expect(result.current).toBe(1);
});
