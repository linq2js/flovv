import { processFlow } from "./index";

test("delay: success", () => {
  const callback = jest.fn();
  function* flow() {
    yield { delay: 10 };
  }
  processFlow(flow());
});

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
