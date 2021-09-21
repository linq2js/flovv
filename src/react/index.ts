import * as React from "react";

import {
  AnyFunc,
  FlowController,
  FlowDataInfer,
  FlowStatus,
  Flow,
} from "../lib";

export interface FlowProviderProps {
  controller: FlowController;
  suspense?: boolean;
  errorBoundary?: boolean;
}

export interface FlowHook<T extends AnyFunc> {
  readonly current: Flow<T> | undefined;
  readonly data: FlowDataInfer<T> | undefined;
  readonly status: FlowStatus | "unknown";
  readonly idle: boolean;
  readonly running: boolean;
  readonly completed: boolean;
  readonly faulted: boolean;
  readonly error: Error | undefined;
  readonly cancelled: boolean;
  readonly stale: boolean;
  start(...args: Parameters<T>): this;
  restart(...args: Parameters<T>): this;
  cancel(): this;
}

interface FlowContext {
  controller: FlowController;
  suspense: boolean;
  errorBoundary: boolean;
}

const flowContext = React.createContext<FlowContext>(null as any);

export function useFlow<T extends AnyFunc>(flow: T): FlowHook<T>;
export function useFlow<T extends AnyFunc>(key: string, flow: T): FlowHook<T>;
export function useFlow<T extends AnyFunc>(...args: any[]): FlowHook<T> {
  const { controller, errorBoundary, suspense } = React.useContext(flowContext);
  const [key, fn] = args.length > 1 ? args : [args[0], args[1]];
  const rerender = React.useState<any>()[1];
  const renderingRef = React.useRef(false);
  const flowRef = React.useRef<Flow<T>>();
  const { flowHook, handleSuspeseAndErrorBoundary } = React.useMemo(() => {
    return createFlowHook(flowRef, renderingRef, suspense, errorBoundary);
  }, [suspense, errorBoundary]);

  renderingRef.current = true;
  flowRef.current = controller.flow(key, fn);

  React.useLayoutEffect(() => {
    renderingRef.current = false;
    return controller.on("#flow", (flow) => {
      if (flow.key === key) {
        rerender({});
      }
    });
  });

  handleSuspeseAndErrorBoundary();

  return flowHook;
}

function createFlowHook<T extends AnyFunc>(
  flowRef: React.MutableRefObject<Flow<T> | undefined>,
  renderingRef: React.MutableRefObject<boolean>,
  suspense: boolean,
  errorBoundary: boolean
) {
  function handleSuspeseAndErrorBoundary() {
    if (!flowRef.current || !renderingRef.current) return;

    if (errorBoundary && flowRef.current.status === "faulted") {
      throw flowRef.current.error;
    }

    if (suspense && flowRef.current.status === "running") {
      throw new Promise((resolve) => {
        flowRef.current?.on("update", resolve);
      });
    }
  }

  const flowHook = {
    get status() {
      return flowRef.current?.status || "unknown";
    },
    get error() {
      return flowRef.current?.error;
    },
    get running() {
      return flowHook.status === "running";
    },
    get completed() {
      return flowHook.status === "completed";
    },
    get faulted() {
      return flowHook.status === "faulted";
    },
    get idle() {
      return flowHook.status === "idle";
    },
    get data() {
      return flowRef.current?.data;
    },
    get current() {
      return flowRef.current?.current;
    },
    get cancelled() {
      return flowRef.current?.cancelled || false;
    },
    get stale() {
      return flowRef.current?.stale || false;
    },
    start(...args: Parameters<T>) {
      flowRef.current?.start(...args);
      handleSuspeseAndErrorBoundary();
      return flowHook;
    },
    restart(...args: Parameters<T>) {
      flowRef.current?.restart(...args);
      handleSuspeseAndErrorBoundary();
      return flowHook;
    },
    cancel() {
      flowRef.current?.cancel();
      return flowHook;
    },
  };
  return { flowHook, handleSuspeseAndErrorBoundary };
}

export const FlowProvider: React.FC<FlowProviderProps> = ({
  controller,
  suspense = false,
  errorBoundary = false,
  children,
}) => {
  const value = React.useMemo(
    () => ({ controller, suspense, errorBoundary }),
    [controller, suspense, errorBoundary]
  );

  return React.createElement(flowContext.Provider, {
    value,
    children,
  });
};
