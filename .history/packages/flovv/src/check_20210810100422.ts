import { Flow } from "./index";

const flow: Flow<string> = function* (payload: string) {
  yield { delay: 10 };
  yield {
    any: {
      timeout: { delay: 100 },
    },
  };
};
