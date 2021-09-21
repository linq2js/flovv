import { renderHook } from "@testing-library/react-hooks";
import flovv from "./index";
import { useFlow } from "./react";

test("", () => {
  const callback = jest.fn();
  const store = flovv();
  const selectValue = (key) => (state) => state[key];
  const { result } = renderHook(() => {
    callback();
  });
});
