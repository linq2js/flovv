import { Flow } from "./index";

const flow: Flow = function* (payload: number) {
  yield { delay: 10 };
};
