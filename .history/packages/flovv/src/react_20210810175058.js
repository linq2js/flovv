import {
  useContext,
  createContext,
  createElement,
  useRef,
  useState,
  useEffect,
} from "react";

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
  const rerender = useState()[1];
  if (ref.flow !== flow) {
    if (ref.wrapper) ref.wrapper.dispose();
    ref.flow = flow;
    ref.wrapper = createFlowWrapper(ref.flow, rerender);
  }

  useEffect(() => {
    return () => {
      ref.wrapper.unmount = true;
    };
  }, [ref.wrapper]);
}

function createFlowWrapper(flow) {
  const wrapper = {
    start() {
      return wrapper;
    },
    restart() {
      return wrapper;
    },
  };

  return wrapper;
}
