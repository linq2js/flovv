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
  const flowHook: FlowHook<FlowDataInfer<T>> = React.useMemo(() => {
    const result = {
      get status() {
        return flowRef.current?.status || "unknown";
      },
      get error() {
        return flowRef.current?.error;
      },
      get running() {
        return result.status === "running";
      },
      get completed() {
        return result.status === "completed";
      },
      get faulted() {
        return result.status === "faulted";
      },
      get idle() {
        return result.status === "idle";
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

        renderingRef.current &&
          handleSuspeseAndErrorBoundary(
            suspense,
            errorBoundary,
            flowRef.current
          );
        return result;
      },
      restart(...args: Parameters<T>) {
        flowRef.current?.restart(...args);

        renderingRef.current &&
          handleSuspeseAndErrorBoundary(
            suspense,
            errorBoundary,
            flowRef.current
          );

        return result;
      },
      cancel() {
        flowRef.current?.cancel();
        return result;
      },
    };
    return result;
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

  handleSuspeseAndErrorBoundary(suspense, errorBoundary, flowRef.current);

  return flowHook;
}

function handleSuspeseAndErrorBoundary(
  suspense: boolean,
  errorBoundary: boolean,
  flow: Flow | undefined
) {
  if (!flow) return;

  if (errorBoundary && flow.status === "faulted") {
    throw flow.error;
  }

  if (suspense && flow.status === "faulted") {
    throw new Promise((resolve) => {
      flow.on("update", resolve);
    });
  }
}

export const FlowProvider: React.FC<FlowProviderProps> = ({
  controller,
  suspense = true,
  errorBoundary = true,
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
