import { renderHook } from "@testing-library/react-hooks";
import { createElement } from "react";
import { act } from "react-dom/test-utils";
import flovv from "./index";
import { useFlow, Provider } from "./react";

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

  act(() => {
    store.run(updateValue);
  });

  expect(callback).toBeCalledTimes(2);
  expect(result.current).toBe(2);
});

function createWrapper(options) {
  const store = flovv(options);
  return [
    ({ children }) => createElement(Provider, { store, children }),
    store,
  ];
}
