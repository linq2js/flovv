import { useContext, createContext, createElement } from "react";

const storeContext = createContext();

export function useStore() {
  return useContext(storeContext);
}

export function Provider({ children, store }) {
  return createElement(storeContext.Provider, { value: store, children });
}
