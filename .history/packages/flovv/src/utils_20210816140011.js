import { createElement } from "react";
import flovv from "./index";
import { Provider } from "./react";
import { act } from "@testing-library/react-hooks";

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

export function delayedAct(ms, callback) {
  return act(async () => {
    if (callback) {
      await callback();
    }
    await delay(ms);
  });
}
