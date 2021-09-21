import flovv from "./index";

test("noop", () => {
  const store = flovv({ state: { state1: 1, state2: 2 } });
});
