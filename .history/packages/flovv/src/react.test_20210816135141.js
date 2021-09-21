import { renderHook } from "@testing-library/react-hooks";
import { createElement } from "react";
import flovv from "./index";
import { useFlow, Provider } from "./react";

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

function createWrapper(options) {
  const store = flovv(options);
  return [({ children }) => createElement(Provider)];
}
