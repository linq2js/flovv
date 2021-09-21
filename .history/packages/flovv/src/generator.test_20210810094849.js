import { processFlow } from "./index";

test("delay: success", () => {
  function* flow() {}
});

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
