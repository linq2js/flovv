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
  options: UseFlowOptions<T>
): FlowHook<T>;
export function useFlow<T extends AnyFunc>(
  key: [string, ...Parameters<T>],
  flow: T,
  options?: UseFlowOptionsWithoutArgs<T>
): FlowHookWithoutArgs<T>;
export function useFlow<T extends AnyFunc>(
  key: string,
  flow: T,
  options?: UseFlowOptionsWithArgs<T>
): FlowHook<T>;
export function useFlow<T extends AnyFunc>(
  flow: T,
  options?: UseFlowOptionsWithArgs<T>
): FlowHook<T>;

export function useFlow(
  key: string | [string, ...any[]],
  options?: UseFlowOptionsWithoutArgs
): FlowHook<AnyFunc>;
export function useFlow<T extends AnyFunc>(...args: any[]): any {
  // useFlow(options)
  if (
    args[0] &&
    args.length === 1 &&
    typeof args[0] === "object" &&
    !Array.isArray(args[0])
  ) {
    const { flow, key, ...options } = args[0];
    args = [key, flow, options];
  }

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
  if (!provider) {
    throw new Error("No flow provider found");
  }
  const prependArgs: any[] = [];
  let overrideArgs: [any, T, UseFlowOptionsWithArgs<T>];
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
    const status = flowRef.current?.status;
    return provider.controller.on(FLOW_UPDATE_EVENT, (flow: Flow) => {
      if (optionsRef.current.disabled) return;
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

  return flowHook;
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
