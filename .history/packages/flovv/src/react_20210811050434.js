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

export function useFlow(flowFn, payload) {
  const store = useStore();
  const flow = store.flow(flowFn);
  const ref = useRef({}).current;
  const rerender = useState()[1];
  if (ref.flow !== flow || ref.store !== store) {
    if (ref.wrapper) {
      ref.wrapper.dispose();
    }
    ref.flow = flow;
    ref.store = store;
    ref.wrapper = createFlowWrapper(ref.flow, rerender);
  }

  useEffect(() => {
    ref.wrapper.mount = true;
    return () => {
      ref.wrapper.unmount = true;
    };
  }, [ref.wrapper]);

  ref.wrapper.payload = payload;

  return ref.wrapper;
}

function createFlowWrapper(flow, rerender) {
  let unwatch;
  const wrapper = {
    get status() {
      return flow.status;
    },
    get stale() {
      return flow.stale;
    },
    get data() {
      return flow.data;
    },
    cancel() {
      flow.cancel();
      return wrapper;
    },
    dispose() {
      unwatch();
    },
    start(payload) {
      flow.start(arguments.length ? payload : wrapper.payload);
      return wrapper;
    },
    restart(payload) {
      flow.restart(arguments.length ? payload : wrapper.payload);
      return wrapper;
    },
  };

  Object.defineProperties(wrapper, {
    loading: createStatusGetter(flow, "loading"),
    fail: createStatusGetter(flow, "fail"),
    success: createStatusGetter(flow, "success"),
    cancelled: createStatusGetter(flow, "cancelled"),
    disposed: createStatusGetter(flow, "disposed"),
  });

  unwatch = flow.watch(() => {
    if (!wrapper.unmount) {
      rerender({});
    }
  });

  return wrapper;
}

function createStatusGetter(flow, status) {
  return { get: () => flow.status === status };
}
