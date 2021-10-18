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
  fallback?: React.ReactNode;
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
  readonly disabled: boolean;
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
  get(...args: Parameters<T>): FlowDataInfer<T> | undefined;
  tryGet(
    defaultValue: FlowDataInfer<T>,
    ...args: Parameters<T>
  ): FlowDataInfer<T>;
}

export interface UseFlowOptions<T extends AnyFunc = AnyFunc>
  extends UseFlowOptionsWithArgs<T> {
  flow: T;
  key?: any;
}

export interface UseFlowOptionsWithArgs<T extends AnyFunc>
  extends UseFlowOptionsWithoutArgs<T> {
  args?: Parameters<T>;
}

export interface UseFlowOptionsWithoutArgs<T extends AnyFunc = AnyFunc> {
  defaultData?: FlowDataInfer<T>;
  suspense?: boolean;
  errorBoundary?: boolean;
  disabled?: boolean;
  onUpdated?: (flow: Flow<T>) => void;
  onCompleted?: (data: FlowDataInfer<T>) => void;
  onFaulted?: (error: Error) => void;
}

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

interface FlowHookOptions<T extends AnyFunc> extends UseFlowOptionsWithArgs<T> {
  prependArgs: any[];
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

export interface UseFlow extends Function {
  // #1
  <T extends AnyFunc>(options: UseFlowOptions<T>): FlowHook<T>;
  // #2
  <T extends AnyFunc>(
    options: Exclude<UseFlowOptions<T>, "args">,
    deps: Parameters<T>
  ): FlowHook<T>;
  // #3
  <T extends AnyFunc>(
    key: [string, ...Parameters<T>],
    flow: T,
    options?: UseFlowOptionsWithoutArgs<T>
  ): FlowHookWithoutArgs<T>;
  // #4
  <T extends AnyFunc>(
    key: [string, ...Parameters<T>],
    flow: T,
    options?: UseFlowOptionsWithoutArgs<T>
  ): FlowHookWithoutArgs<T>;
  // #5
  <T extends AnyFunc>(
    key: string,
    flow: T,
    options?: UseFlowOptionsWithArgs<T>
  ): FlowHook<T>;
  // #6
  <T extends AnyFunc>(
    key: string,
    flow: T,
    deps: Parameters<T>,
    options?: UseFlowOptionsWithoutArgs<T>
  ): FlowHook<T>;
  // #7
  <T extends AnyFunc>(
    flow: T,
    options?: UseFlowOptionsWithArgs<T>
  ): FlowHook<T>;
  // #8
  <T extends AnyFunc>(
    flow: T,
    deps: Parameters<T>,
    options?: UseFlowOptionsWithoutArgs<T>
  ): FlowHook<T>;
  // #9
  (
    key: string | [string, ...any[]],
    options?: UseFlowOptionsWithoutArgs
  ): FlowHook<AnyFunc>;
  // #10
  (
    key: string,
    deps: any[],
    options?: UseFlowOptionsWithoutArgs
  ): FlowHook<AnyFunc>;
}

export const useFlow: UseFlow = useFlowFn;

function useFlowBase<T extends AnyFunc>(
  key: any,
  fn?: T,
  deps?: Parameters<T>,
  originalOptions?: UseFlowOptionsWithArgs<T>
) {
  const provider = React.useContext(flowContext);

  if (!provider) {
    throw new Error("No flow provider found");
  }

  const prependArgs: any[] = [];
  let args: Parameters<T> | undefined = originalOptions?.args;

  // no fn presents
  if (!fn) {
    if (!provider.defaultFlow) {
      throw new Error("No provider.defaultFlow presents");
    }

    // try to find fn from defaultFlow
    if (typeof provider.defaultFlow === "function") {
      fn = provider.defaultFlow as any;
      if (Array.isArray(key)) {
        prependArgs.push(...key);
      } else {
        prependArgs.push(key);
      }
    } else {
      if (typeof key === "undefined") {
        throw new Error("No key presents. Cannot find flow by key");
      }
      if (Array.isArray(key)) {
        fn = provider.defaultFlow[key[0]] as any;
      } else {
        fn = provider.defaultFlow[key] as any;
      }
    }
  }

  if (typeof key === "undefined") {
    key = fn;
  }

  if (Array.isArray(key)) {
    args = key.slice(1) as any;
  }

  const {
    suspense = provider.suspense,
    errorBoundary = provider.errorBoundary,
    ...options
  } = originalOptions || {};
  const fixedArgs = !!args;
  const rerender = React.useState<any>()[1];
  const optionsRef = React.useRef<FlowHookOptions<T>>({ prependArgs });
  const renderingRef = React.useRef(false);
  const unmountRef = React.useRef(false);
  const flowRef = React.useRef<InternalFlow<T>>();
  const firstRunRef = React.useRef(true);
  const { flowHook, handleSuspeseAndErrorBoundary } = React.useMemo(() => {
    return createFlowHook(flowRef, renderingRef, optionsRef, fixedArgs);
  }, [suspense, errorBoundary, fixedArgs]);

  // update refs
  renderingRef.current = true;
  optionsRef.current = {
    ...options,
    args,
    suspense,
    errorBoundary,
    prependArgs,
  };
  // make sure removed flow does not cause an error
  flowRef.current =
    (provider.controller.flow(key, fn as any) as any) || flowRef.current;

  React.useEffect(
    () => () => {
      unmountRef.current = true;
    },
    []
  );

  React.useLayoutEffect(() => {
    renderingRef.current = false;
    const status = flowRef.current?.status;
    return provider.controller.on(FLOW_UPDATE_EVENT, (flow: Flow) => {
      if (optionsRef.current.disabled || unmountRef.current) return;
      if (flow.key === key) {
        rerender({});
        if (flow.status !== status) {
          optionsRef.current.onUpdated?.(flow);
          if (flow.completed) {
            optionsRef.current.onCompleted?.(flow.data);
          } else if (flow.faulted) {
            optionsRef.current.onFaulted?.(flow.error as any);
          }
        }
      }
    });
  });

  handleSuspeseAndErrorBoundary();

  if (deps) {
    const firstRun = firstRunRef.current;
    firstRunRef.current = false;
    React.useMemo.call(
      null,
      () => (firstRun ? flowHook.start(...deps) : flowHook.restart(...deps)),
      deps
    );
  }

  return flowHook;
}

function useFlowFn<T extends AnyFunc>(...args: any[]): any {
  // overload #1, #2
  if (typeof args[0] === "object" && !Array.isArray(args[0])) {
    const options: UseFlowOptions<T> = args[0];
    return useFlowBase(options.key, options.flow, args[1], options);
  }

  // overload #7, #8
  if (typeof args[0] === "function") {
    // overload #8 (flow, deps, options)
    if (Array.isArray(args[1])) {
      const [flow, deps, options] = args;
      return useFlowBase(undefined, flow, deps, options);
    }
    const [flow, options] = args;
    return useFlowBase(undefined, flow, undefined, options);
  }

  if (Array.isArray(args[2])) {
    const [key, flow, deps, options] = args;
    return useFlowBase(key, flow, deps, options);
  }
  const [key, flow, options] = args;
  return useFlowBase(key, flow, undefined, options);
}

export interface FlowComponentOptions<TProps> {
  loading?: (props: TProps) => any;
  error?: (props: TProps, error: any) => any;
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
    if (optionsRef.current.disabled) {
      return flowHook;
    }
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
      if (!flowRef.current?.hasData) {
        return optionsRef.current.defaultData;
      }
      return flowRef.current?.data;
    },
    get disabled() {
      return optionsRef.current.disabled || false;
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
      if (!optionsRef.current.disabled) {
        flowRef.current?.update(data);
      }
      return flowHook;
    },
    get(...args: Parameters<T>) {
      return flowHook.start(...args).data;
    },
    tryGet(defaultValue, ...args: Parameters<T>) {
      const { result = defaultValue } = {
        result: flowHook.start(...args).data,
      };
      return result;
    },
    start(...args: Parameters<T>) {
      return run("start", args);
    },
    restart(...args: Parameters<T>) {
      return run("restart", args);
    },
    next(payload?: any) {
      if (!optionsRef.current.disabled) {
        flowRef.current?.next(payload);
      }
      return flowHook;
    },
    cancel() {
      if (!optionsRef.current.disabled) {
        flowRef.current?.cancel();
      }
      return flowHook;
    },
  };
  return { flowHook, handleSuspeseAndErrorBoundary };
}

export const FlowProvider: React.FC<FlowProviderProps> = (props) => {
  const parentProvider = React.useContext(flowContext);
  const rerender = React.useState<any>()[1];
  const {
    controller = parentProvider?.controller,
    suspense = parentProvider?.suspense || false,
    errorBoundary = parentProvider?.errorBoundary || false,
    defaultFlow = parentProvider?.defaultFlow,
    fallback,
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
    controller.promise.finally(() => rerender({}));
    return React.createElement(React.Fragment, {}, fallback);
  }

  return React.createElement(flowContext.Provider, {
    value,
    children,
  });
};
