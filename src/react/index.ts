import * as React from "react";

import {
  AnyFunc,
  FlowController,
  FlowDataInfer,
  FlowStatus,
  Flow,
  FLOW_UPDATE_EVENT,
  getKey,
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
  readonly hasData: boolean;
  start(): this;
  restart(): this;
  start(...args: Parameters<T>): this;
  restart(...args: Parameters<T>): this;
  cancel(): this;
}

export interface UseFlowOptions<T extends AnyFunc> {
  args?: Parameters<T>;
}

interface FlowContext {
  controller: FlowController;
  suspense: boolean;
  errorBoundary: boolean;
}

const defaultFlowContext = {
  get controller(): never {
    throw new Error("No flow provider found");
  },
};

const flowContext = React.createContext<FlowContext>(defaultFlowContext as any);

export function useController(): FlowController {
  return React.useContext(flowContext).controller;
}

export function useFlow<T extends AnyFunc>(
  key: string,
  flow: T,
  options?: UseFlowOptions<T>
): FlowHook<T>;
export function useFlow<T extends AnyFunc>(
  flow: T,
  options?: UseFlowOptions<T>
): FlowHook<T>;

export function useFlow<T extends AnyFunc>(...args: any[]): any {
  const { controller, errorBoundary, suspense } = React.useContext(flowContext);
  const [key, fn, options = {}] =
    typeof args[1] === "function" ? args : [getKey(args[0]), args[0], args[1]];
  const rerender = React.useState<any>()[1];
  const optionsRef = React.useRef<any>();
  const renderingRef = React.useRef(false);
  const flowRef = React.useRef<Flow<T>>();
  const { flowHook, handleSuspeseAndErrorBoundary } = React.useMemo(() => {
    return createFlowHook(
      flowRef,
      renderingRef,
      optionsRef,
      suspense,
      errorBoundary
    );
  }, [suspense, errorBoundary]);

  renderingRef.current = true;
  optionsRef.current = options;
  flowRef.current = controller.flow(key, fn);

  React.useLayoutEffect(() => {
    renderingRef.current = false;
    return controller.on(FLOW_UPDATE_EVENT, (flow) => {
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
  optionsRef: React.MutableRefObject<any>,
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

  function getArgs(args: Parameters<T>): Parameters<T> {
    if (!optionsRef.current.args) return args;
    return args.concat(optionsRef.current.args.slice(args.length)) as any;
  }

  const flowHook = {
    get hasData() {
      return flowRef.current?.hasData || false;
    },
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
      flowRef.current?.start(...getArgs(args));
      handleSuspeseAndErrorBoundary();
      return flowHook;
    },
    restart(...args: Parameters<T>) {
      flowRef.current?.restart(...getArgs(args));
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

export const FlowProvider: React.FC<FlowProviderProps> = (props) => {
  const parentProvider = React.useContext(flowContext);
  const {
    controller = parentProvider?.controller,
    suspense = parentProvider?.suspense || false,
    errorBoundary = parentProvider?.errorBoundary || false,
    children,
  } = props;
  const value = React.useMemo(
    () => ({ controller, suspense, errorBoundary }),
    [controller, suspense, errorBoundary]
  );

  if (controller.error) {
    throw controller.error;
  }

  if (!controller.ready) {
    if (suspense) throw controller.promise;
    return null;
  }

  return React.createElement(flowContext.Provider, {
    value,
    children,
  });
};
