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
  return useContext(storeContext).store;
}

export function Provider({ children, store, suspense, errorBoundary }) {
  const status = store.status;
  if (status === "loading") {
    if (suspense) throw new Promise((resolve) => store.ready(resolve));
  }
  return createElement(storeContext.Provider, {
    value: { store, suspense, errorBoundary },
    children,
  });
}

export function useFlow(flowFn, payload) {
  const { store, suspense, errorBoundary } = useContext(storeContext);
  const flow = store.flow(flowFn);
  const ref = useRef({}).current;
  const rerender = useState()[1];
  if (ref.flow !== flow || ref.store !== store) {
    // if (ref.wrapper) {
    //   ref.wrapper.dispose();
    // }
    ref.flow = flow;
    ref.store = store;
    ref.wrapper = createFlowWrapper(ref.flow, rerender);
  }

  useEffect(() => {
    ref.wrapper.mount = true;
    return () => {
      ref.wrapper.unmount = true;
      ref.wrapper.dispose();
    };
  }, [ref.wrapper]);

  Object.assign(ref.wrapper, {
    payload,
    suspense,
    errorBoundary,
  });

  if (typeof flowFn !== "function") {
    return ref.wrapper.start().data;
  }

  return ref.wrapper;
}

function createFlowWrapper(flow, rerender) {
  let unwatch;
  let disposed = false;
  const wrapper = {
    get status() {
      return flow.status;
    },
    get stale() {
      return flow.stale;
    },
    get data() {
      if (flow.status === "loading") {
        if (wrapper.suspense) throw flow;
      } else if (flow.status === "fail") {
        if (wrapper.errorBoundary) throw flow.error;
      }
      return flow.data;
    },
    cancel() {
      flow.cancel();
      return wrapper;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
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
    if (wrapper.unmount) {
      unwatch();
      return;
    }
    rerender({});
  });

  return wrapper;
}

function createStatusGetter(flow, status) {
  return { get: () => flow.status === status };
}
