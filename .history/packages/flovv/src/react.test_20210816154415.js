import { renderHook } from "@testing-library/react-hooks";
import { useFlow } from "./react";
import { createWrapper, delayedAct } from "./utils";

test("state selector", async () => {
  const [wrapper, store] = createWrapper({ state: { value: 1 } });
  const selectValue = (key) => (state) => state[key];
  function* updateValue() {
    yield { set: { value: 2 } };
  }
  const { result } = renderHook(
    () => {
      return useFlow(selectValue).start("value").data;
    },
    { wrapper }
  );
  expect(result.current).toBe(1);

  await delayedAct(0, () => {
    store.run(updateValue);
  });

  expect(result.current).toBe(2);
});
