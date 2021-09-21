import { useContext, createContext, createElement, useRef } from "react";

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
  const ref = useRef({}).current;
  if (ref.flow !== flow) {
    if (ref.wrapper) ref.wrapper.dispose();
    ref.flow = flow;
    ref.wrapper = createFlowWrapper(ref.flow);
  }
}

function createFlowWrapper(flow) {
  const wrapper = {};

  return wrapper;
}
