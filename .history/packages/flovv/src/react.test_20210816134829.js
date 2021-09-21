import { renderHook } from "@testing-library/react-hooks";
import flovv from "./index";

test("", () => {
  const store = flovv();
  const { result } = renderHook(() => {});
});
