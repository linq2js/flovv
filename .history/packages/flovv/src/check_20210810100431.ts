import { Flow } from "./index";

const flow: Flow<string, number> = function* (payload: string) {
  yield { delay: 10 };
  yield {
    any: {
      timeout: { delay: 100 },
    },
  };
  return 11;
};
