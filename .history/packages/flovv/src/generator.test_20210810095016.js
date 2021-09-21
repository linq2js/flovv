import { processFlow } from "./index";

test("delay: success", async () => {
  const callback = jest.fn();
  function* flow() {
    yield { delay: 10 };
    callback();
  }
  processFlow(flow());
  expect(callback).toBeCalledTimes(0);
  await delay(15);
});

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
