import { useContext, createContext, createElement } from "react";

const storeContext = createContext();

export function Provider({ children, store }) {
  return createElement(storeContext.Provider, { value: store, children });
}
