import * as React from "react";

import {
  AnyFunc,
  FlowController,
  FlowDataInfer,
  FlowStatus,
  Flow,
  FLOW_UPDATE_EVENT,
  getKey,
  InternalFlow,
  makeKey,
  FlowPrefetcher,
} from "../lib";

export interface FlowProviderProps {
  controller?: FlowController;
  suspense?: boolean;
  errorBoundary?: boolean;
}

export interface FlowHookWithoutArgs<T extends AnyFunc> {
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
  update(data: FlowDataInfer<T>): this;
  update(reducer: (prev: FlowDataInfer<T>) => FlowDataInfer<T>): this;
  next(payload?: any): this;

  start(): this;
  restart(): this;
  cancel(): this;
}

export interface FlowHook<T extends AnyFunc> extends FlowHookWithoutArgs<T> {
  start(...args: Parameters<T>): this;
  restart(...args: Parameters<T>): this;
}

export interface UseFlowOptions<T extends AnyFunc>
  extends UseFlowOptionsWithoutArgs {
  args?: Parameters<T>;
  suspense?: boolean;
  errorBoundary?: boolean;
}

export interface UseFlowOptionsWithoutArgs {}

export interface PrefetchMapFn extends Function {
  <T extends AnyFunc, TResult>(
    key: any,
    flow: T,
    mapper: (flow: Flow) => TResult,
    defaultValue?: TResult
  ): TResult | undefined;
  <TResult>(key: any, mapper: (flow: Flow) => TResult, defaultValue?: TResult):
    | TResult
    | undefined;
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

export function usePrefetcher(): [FlowPrefetcher, PrefetchMapFn] {
  const controller = useController();
  const keys = React.useRef<Set<any>>(new Set()).current;
  const rerender = React.useState<any>()[1];

  React.useEffect(() => {
    return controller.on(FLOW_UPDATE_EVENT, (flow: Flow) => {
      if (!keys.has(flow.key)) return;
      rerender({});
    });
  }, [keys, rerender, controller]);

  return React.useMemo(
    () => [
      (...args: any[]) => {
        const key = Array.isArray(args[0]) ? makeKey(args[0]) : args[0];
        keys.add(key);
        const flow = (controller as any).start(...args);
        return flow;
      },
      (key: any, ...args: any[]): any => {
        const [fn, mapper, defaultValue] =
          typeof args[0] === "function" && typeof args[1] === "function"
            ? args
            : [undefined, ...args];
        const k = Array.isArray(key) ? makeKey(key) : key;
        const flow = fn ? controller.flow(k, fn) : controller.flow(k);
        return flow ? mapper(flow) : defaultValue;
      },
    ],
    [controller, keys]
  );
}

export function useFlow<T extends AnyFunc>(
  key: [string, ...Parameters<T>],
  flow: T,
  options?: UseFlowOptionsWithoutArgs
): FlowHookWithoutArgs<T>;
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
  let fixedArgs = false;
  // key array  useFlow([key, arg1, arg2, arg3, arg4])
  if (Array.isArray(args[0])) {
    // overwrite args option
    args[2] = { ...args[2], args: args[0].slice(1) };
    args[0] = makeKey(args[0]);
    fixedArgs = true;
  }
  const provider = React.useContext(flowContext);
  const [
    key,
    fn,
    {
      suspense = provider.suspense,
      errorBoundary = provider.errorBoundary,
      ...options
    } = {} as any,
  ] =
    typeof args[1] === "function" ? args : [getKey(args[0]), args[0], args[1]];
  const rerender = React.useState<any>()[1];
  const optionsRef = React.useRef<any>();
  const renderingRef = React.useRef(false);
  const flowRef = React.useRef<InternalFlow<T>>();
  const { flowHook, handleSuspeseAndErrorBoundary } = React.useMemo(() => {
    return createFlowHook(flowRef, renderingRef, optionsRef, fixedArgs);
  }, [suspense, errorBoundary, fixedArgs]);

  renderingRef.current = true;
  optionsRef.current = options;
  // make sure removed flow does not cause an error
  flowRef.current =
    (provider.controller.flow(key, fn) as any) || flowRef.current;

  React.useLayoutEffect(() => {
    renderingRef.current = false;
    return provider.controller.on(FLOW_UPDATE_EVENT, (flow) => {
      if (flow.key === key) {
        rerender({});
      }
    });
  });

  handleSuspeseAndErrorBoundary();

  return flowHook;
}

function createFlowHook<T extends AnyFunc>(
  flowRef: React.MutableRefObject<InternalFlow<T> | undefined>,
  renderingRef: React.MutableRefObject<boolean>,
  optionsRef: React.MutableRefObject<UseFlowOptions<AnyFunc>>,
  fixedArgs: boolean
) {
  function handleSuspeseAndErrorBoundary() {
    if (!flowRef.current || !renderingRef.current) return;

    if (
      optionsRef.current.errorBoundary &&
      flowRef.current.status === "faulted"
    ) {
      throw flowRef.current.error;
    }

    if (optionsRef.current.suspense && flowRef.current.status === "running") {
      throw new Promise((resolve) => {
        flowRef.current?.on("update", resolve);
      });
    }
  }

  function getArgs(args: Parameters<T>): Parameters<T> {
    if (!optionsRef.current.args) return args;
    return args.concat(optionsRef.current.args.slice(args.length)) as any;
  }

  function run(type: "start" | "restart", args: Parameters<T>) {
    if (args.length && fixedArgs) {
      throw new Error(
        "Passing arguments to fixed args flow is not allowed. Use the overload useFlow(key, flow, { args: [] }) instead"
      );
    }
    flowRef.current?.[type](...getArgs(args));
    handleSuspeseAndErrorBoundary();
    return flowHook;
  }

  const flowHook: FlowHook<T> = {
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
      return flowRef.current?.running || false;
    },
    get completed() {
      return flowRef.current?.completed || false;
    },
    get faulted() {
      return flowRef.current?.faulted || false;
    },
    get idle() {
      return flowRef.current?.idle || false;
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
    update(data: any) {
      flowRef.current?.update(data);
      return flowHook;
    },
    start(...args: Parameters<T>) {
      return run("start", args);
    },
    restart(...args: Parameters<T>) {
      return run("restart", args);
    },
    next(payload?: any) {
      flowRef.current?.next(payload);
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

  if (!controller) {
    throw new Error("No controller provided");
  }

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
