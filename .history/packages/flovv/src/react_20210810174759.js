import { useContext, createContext, createElement } from "react";

const storeContext = createContext();

export function useStore() {
  return useContext(storeContext);
}

export function Provider({ children, store }) {
  return createElement(storeContext.Provider, { value: store, children });
}

export function useFlow(flowFn) {
  const store = useStore();
  const flow = store.flow(flowFn);
}
