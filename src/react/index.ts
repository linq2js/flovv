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
  FlowExecutor,
} from "../lib";

export interface FlowProviderProps {
  controller?: FlowController;
  defaultFlow?: AnyFunc | Record<string, AnyFunc>;
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

interface FlowHookOptions<T extends AnyFunc> extends UseFlowOptions<T> {
  prependArgs?: any[];
}

interface FlowContext {
  controller: FlowController;
  suspense: boolean;
  errorBoundary: boolean;
  defaultFlow: AnyFunc | Record<string, AnyFunc>;
}

const flowContext = React.createContext<FlowContext>(null as any);

export function useController(): FlowController {
  return React.useContext(flowContext).controller;
}

export function usePrefetcher(): [FlowExecutor, PrefetchMapFn] {
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

export function useFlow(
  key: string | [string, ...any[]],
  options?: UseFlowOptionsWithoutArgs
): FlowHook<AnyFunc>;
export function useFlow<T extends AnyFunc>(...args: any[]): any {
  let fixedArgs = false;
  const originalKey = args[0];
  // key array  useFlow([key, arg1, arg2, arg3, arg4])
  if (Array.isArray(args[0])) {
    // overwrite args option
    // exclude first item (key)
    args[2] = { ...args[2], args: args[0].slice(1) };
    args[0] = makeKey(args[0]);
    fixedArgs = true;
  }

  const provider = React.useContext(flowContext);
  const prependArgs: any[] = [];
  let overrideArgs: [any, T, UseFlowOptions<T>];
  if (typeof args[1] === "function") {
    overrideArgs = args as any;
  }
  // useFlow(fn, options)
  else if (typeof args[0] === "function") {
    overrideArgs = [getKey(args[0]), args[0], args[1]];
  } else {
    // useFlow(key, options)
    if (Array.isArray(originalKey)) {
      prependArgs.push(...originalKey);
    } else {
      prependArgs.push(originalKey);
    }
    let defaultFlow: T;
    const defaultFlowKey = prependArgs[0];
    if (typeof provider.defaultFlow === "function") {
      defaultFlow = provider.defaultFlow as any;
    } else if (
      typeof provider.defaultFlow === "object" &&
      defaultFlowKey in provider.defaultFlow
    ) {
      defaultFlow = provider.defaultFlow[defaultFlowKey] as any;
      prependArgs.shift();
    } else {
      throw new Error(`No default flow provided for key ${originalKey}`);
    }
    overrideArgs = [getKey(args[0]), defaultFlow, args[1]];
  }

  const [
    key,
    fn,
    {
      suspense = provider.suspense,
      errorBoundary = provider.errorBoundary,
      ...options
    } = {},
  ] = overrideArgs;
  const rerender = React.useState<any>()[1];
  const optionsRef = React.useRef<FlowHookOptions<T>>({});
  const renderingRef = React.useRef(false);
  const flowRef = React.useRef<InternalFlow<T>>();
  const { flowHook, handleSuspeseAndErrorBoundary } = React.useMemo(() => {
    return createFlowHook(flowRef, renderingRef, optionsRef, fixedArgs);
  }, [suspense, errorBoundary, fixedArgs]);

  // update refs
  renderingRef.current = true;
  optionsRef.current = {
    ...options,
    suspense,
    errorBoundary,
    prependArgs,
  };
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
  optionsRef: React.MutableRefObject<FlowHookOptions<T>>,
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

  function getArgs(inputArgs: Parameters<T>): Parameters<T> {
    const prependArgs = optionsRef.current.prependArgs || [];
    const defaultArgs = optionsRef.current.args;

    if (!defaultArgs) {
      return [...prependArgs, ...inputArgs] as any;
    }

    return [
      ...prependArgs,
      ...inputArgs,
      ...defaultArgs.slice(inputArgs.length),
    ] as any;
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
    defaultFlow = parentProvider?.defaultFlow,
    children,
  } = props;

  const value = React.useMemo(
    () => ({ controller, suspense, errorBoundary, defaultFlow }),
    [controller, suspense, errorBoundary, defaultFlow]
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
