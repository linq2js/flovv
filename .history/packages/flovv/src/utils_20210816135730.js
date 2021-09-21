import flovv from "./index";
import { Provider } from "./react";

export const delay = (ms, value) => {
  let timer;
  return Object.assign(
    new Promise((resolve) => setTimeout(resolve, ms, value)),
    {
      cancel() {
        clearTimeout(timer);
      },
    }
  );
};

export function createWrapper(options) {
  const store = flovv(options);
  return [
    ({ children }) => createElement(Provider, { store, children }),
    store,
  ];
}
