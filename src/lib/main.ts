export type FlowStatus = "idle" | "running" | "completed" | "faulted";

export type VoidFn = () => void;
export type AnyFunc = (...args: any[]) => any;

export const FLOW_UPDATE_EVENT = "#flow";

export interface EffectContext {
  flow: Flow;
  context: any;
  controller: FlowController;
  next(payload?: any): void;
  call(iterator: Iterator<any>): void;
  call<T extends (...args: any[]) => any>(fn: T, ...args: Parameters<T>): void;
  fail(error: any): void;
  end(result: any): void;
}

export type Effect =
  | ((context: EffectContext) => void)
  | Promise<any>
  | Iterator<any>;

export interface InternalEffectContext extends EffectContext {
  flow: InternalFlow;
  controller: InternalFlowController;
}

export type FlowDataInfer<T> = T extends (...args: any[]) => infer TResult
  ? TResult extends Promise<infer TResolved>
    ? TResolved
    : TResult extends Iterator<any, infer TReturn>
    ? TReturn
    : TResult
  : never;

export interface Flow<T extends AnyFunc = AnyFunc> {
  readonly key: any;
  readonly data: FlowDataInfer<T> | undefined;
  readonly stale: boolean;
  readonly status: FlowStatus;
  readonly error: Error | undefined;
  readonly previous: Flow<T> | undefined;
  readonly parent: Flow | undefined;
  readonly cancelled: boolean;
  readonly current: this;
  readonly hasData: boolean;
  on(
    event: "end" | "update" | "cancel" | "start",
    listener: (flow: Flow<T>) => void
  ): VoidFn;
  restart(...args: Parameters<T>): this;
  start(...args: Parameters<T>): this;
  update(value: FlowDataInfer<T>): this;
  update(reducer: (prev: FlowDataInfer<T>) => FlowDataInfer<T>): this;
  cancel(): this;
  dispose(): this;
}

export interface InternalFlow<T extends AnyFunc = any> extends Flow<T> {
  readonly fn: Function;
  readonly parent: InternalFlow | undefined;
  readonly controller: InternalFlowController;
  stale: boolean;
  partial(data: any): void;
  statusChanged(status: FlowStatus, value: any, forceUpdate: boolean): void;
  onChildError(error: Error): void;
}

export type FlowTypeInfer<T> = T extends (...args: any[]) => Generator<Effect>
  ? T
  : T extends (...args: any[]) => Generator<any>
  ? never
  : T;

export interface FlowPrefetcher {
  <T extends AnyFunc>(flow: T, ...args: Parameters<T>): Flow<T>;
  <T extends AnyFunc>(key: [string, ...Parameters<T>], flow: T): Flow<T>;
  <T extends AnyFunc>(key: string, flow: T, ...args: Parameters<T>): Flow<T>;
}

export interface FlowController {
  readonly ready: boolean;
  readonly promise: Promise<void>;
  readonly error?: Error;
  start: FlowPrefetcher;
  restart: FlowPrefetcher;
  flow<T extends AnyFunc>(key: string, flow: T): Flow<T>;
  flow<T extends AnyFunc>(flow: T): Flow<T>;
  flow(key: string): Flow | undefined;
  emit(event: string, payload?: any): void;
  remove(key: string | AnyFunc): void;
  on(
    event: typeof FLOW_UPDATE_EVENT | string | string[],
    listener: (payload: any) => void
  ): VoidFn;
}

export interface InternalFlowController extends FlowController {
  context: any;
  replaceFlow(currentFlow: Flow, withFlow: Flow): void;
  flowUpdated(flow: Flow): void;
  cancelFlow(key: any): void;
}

export type CancellablePromise<T = void> = (T extends Promise<infer TResult>
  ? Promise<TResult>
  : Promise<T>) & { cancel(): void };

export interface ControllerOptions {
  context?: any;
  initData?: Record<string, any>;
  initFlow?: AnyFunc;
  onData?: (data: { [key: string]: any }) => void;
  onCompleted?: (flow: Flow) => void;
  onFaulted?: (flow: Flow) => void;
}

export interface FlowOptions<T extends AnyFunc = AnyFunc> {
  controller: InternalFlowController;
  parent?: InternalFlow;
  previous?: InternalFlow<T>;
  key: any;
  fn: Function;
  onSuccess?: (data: InternalFlow<T>) => void;
  onError?: (error: Error) => void;
  initData?: FlowDataInfer<T>;
  initStatus?: FlowStatus;
  hasData?: boolean;
}

interface EmitterOptions<T> {
  wildcard?: T;
  privateEventPrefix?: string;
}

interface Emitter<TPayload = any, TEvent = string> {
  on(event: TEvent): CancellablePromise;
  on(
    event: TEvent,
    listener: (payload: TPayload | { type: TEvent; payload: TPayload }) => void
  ): VoidFn;
  emit(event: TEvent, payload?: TPayload): void;
  dispose(): void;
}

/**
 * create flow controller
 */
export function createController({
  context,
  initData = {},
  initFlow,
  onData,
  onCompleted,
  onFaulted,
}: ControllerOptions = {}): FlowController {
  let data = { ...initData };
  let promise = Promise.resolve();
  let ready = true;
  let error: Error;
  const flows = new Map<any, InternalFlow>();
  const emitter = createEmitter({ wildcard: "*", privateEventPrefix: "#" });
  const controller: InternalFlowController = {
    context,
    get ready() {
      return ready;
    },
    get error() {
      return error;
    },
    get promise() {
      return promise;
    },
    emit: emitter.emit,
    on: emitter.on,
    start(...args: any[]) {
      return run("start", args);
    },
    restart(...args: any[]) {
      return run("restart", args);
    },
    cancelFlow(key) {
      flows.get(getKey(key))?.cancel();
    },
    replaceFlow(currentFlow: InternalFlow, withFlow: InternalFlow) {
      if (flows.get(currentFlow.key) !== currentFlow) {
        return;
      }
      flows.set(currentFlow.key, withFlow);
    },
    flow(...args: any[]): any {
      const [key, fn] =
        typeof args[1] === "function" ? args : [getKey(args[0]), args[0]];
      // flow(key)
      if (typeof key === "string" && args.length === 1) {
        return flows.get(key);
      }
      let flow = flows.get(key);
      if (!flow) {
        let data: any = undefined;
        let status: FlowStatus | undefined;
        let hasData = false;

        if (typeof key === "string" && key in initData) {
          data = initData[key];
          hasData = true;
          status = "completed";
        }

        flow = createFlow({
          controller,
          key,
          fn,
          initData: data,
          initStatus: status,
          hasData,
        });

        flows.set(key, flow);
      }
      return flow;
    },
    remove(key: any) {
      if (typeof key === "function") {
        key = getKey(key);
      }
      // contains wildcard
      if (typeof key === "string" && key.indexOf("*") !== -1) {
        // ends with
        if (key[0] === "*") {
          key = key.substr(1);
          flows.forEach((flow, k) => {
            if (typeof k === "string" && k.endsWith(key)) {
              flow.dispose();
              flows.delete(k);
            }
          });
        } else {
          // starts with
          key = key.substr(0, key.length - 1);
          flows.forEach((flow, k) => {
            if (typeof k === "string" && k.startsWith(key)) {
              flow.dispose();
              flows.delete(k);
            }
          });
        }
      } else {
        flows.get(key)?.dispose();
        flows.delete(key);
      }
    },
    flowUpdated(flow: InternalFlow) {
      if (flows.get(flow.key) !== flow) return;
      if (flow.status === "completed") {
        if (onData && typeof flow.key === "string") {
          if (data[flow.key] !== flow.data) {
            data = { ...data, [flow.key]: flow.data };
            onData(data);
          }
        }
        onCompleted?.(flow);
      } else if (flow.status === "faulted") {
        onFaulted?.(flow);
      }
      emitter.emit(FLOW_UPDATE_EVENT, flow);
    },
  };

  function run(type: "start" | "restart", inputs: any[]) {
    const args: any[] = [];
    let key: any;
    let fn: any;
    // preload(flow, ...args)
    if (typeof inputs[0] === "function") {
      key = getKey(inputs[0]);
      fn = inputs[0];
      args.push(...inputs.slice(1));
    } else {
      // preload(key, flow, ...args)
      fn = inputs[1];
      if (Array.isArray(inputs[0])) {
        key = makeKey(inputs[0]);
        args.push(...inputs[0].slice(1));
      } else {
        key = inputs[0];
        args.push(...inputs.slice(2));
      }
    }
    return controller.flow(key, fn)[type](...args);
  }

  if (initFlow) {
    ready = false;
    promise = new Promise((resolve, reject) => {
      createFlow({
        controller,
        key: {},
        fn: initFlow,
        onSuccess: (data) => {
          if (isPlainObject(data)) {
            Object.assign(initData, data);
          }
          ready = true;
          resolve();
        },
        onError: (e) => {
          ready = true;
          error = e;
        },
      }).start();
    });
  }

  return controller;
}

export function createFlow<T extends AnyFunc = AnyFunc>({
  controller,
  parent,
  previous,
  key,
  fn,
  onSuccess,
  onError,
  initData,
  initStatus = "idle",
  hasData,
}: FlowOptions<T>) {
  let stale = false;
  let status: FlowStatus = initStatus;
  let error: Error;
  let childError: Error;
  let data: FlowDataInfer<T> | undefined = initData;
  let cancelled = false;
  let disposed = false;

  const iteratorStack: any[] = [];
  const emitter = createEmitter();

  function cleanup() {
    emitter.emit("end");
    emitter.dispose();
  }

  function isRunning() {
    return !disposed && !stale && !flow.cancelled && status === "running";
  }

  function statusChanged(
    newStatus: FlowStatus,
    value: any,
    forceUpdate: boolean
  ) {
    if (!forceUpdate && !isRunning()) return;
    stale = false;
    status = newStatus;
    if (newStatus === "completed") {
      hasData = true;
      data = value;
      onSuccess?.(data as any);
      cleanup();
    } else if (newStatus === "faulted") {
      error = value;
      onError?.(error);
      parent?.onChildError(error);
      cleanup();
    }
    emitter.emit("update", flow);
    controller.flowUpdated(flow);
  }

  function iteratorDone(
    iterator: Iterator<any, T>,
    done: boolean | undefined,
    value: any
  ): any {
    if (!isRunning()) return;
    if (done) {
      if (iteratorStack.length) {
        return iteratorNext(iteratorStack.pop(), value);
      }
      return statusChanged("completed", value, false);
    }
    return iteratorYield(iterator, value);
  }

  function iteratorThrow(iterator: Iterator<any, T>, error: Error) {
    if (!isRunning()) return;
    try {
      const { done, value } = iterator.throw?.(error) || {};
      // error handled
      return iteratorDone(iterator, done, value);
    } catch (e) {
      // error is not handled
      return statusChanged("faulted", e, false);
    }
  }

  function interatorCall(iterator: Iterator<any, T>, next: Iterator<any>) {
    iteratorStack.push(iterator);
    return iteratorNext(next, undefined);
  }

  function iteratorYield(iterator: Iterator<any, T>, value: any): any {
    if (!isRunning()) return;
    if (value) {
      // yield iterator
      if (typeof value.next === "function") {
        return interatorCall(iterator, value);
      }
      // yield promise
      if (value && typeof value.then === "function") {
        return value.then(
          (resolved: any) => {
            iteratorNext(iterator, resolved);
          },
          (rejected: any) => {
            iteratorThrow(iterator, rejected);
          }
        );
      }

      const call = (next: any, ...args: any[]) => {
        if (typeof next === "function") {
          try {
            return iteratorYield(iterator, next(...args));
          } catch (e) {
            return iteratorThrow(iterator, e as any);
          }
        }
        return interatorCall(iterator, next);
      };

      if (typeof value === "function") {
        try {
          return value({
            flow,
            controller,
            context: controller.context,
            next: (value: any) => iteratorNext(iterator, value),
            fail: (error: any) => iteratorThrow(iterator, error),
            call: (next: any, ...args: any[]) => {
              if (typeof next === "function") {
                try {
                  return iteratorYield(iterator, next(...args));
                } catch (e) {
                  return iteratorThrow(iterator, e as any);
                }
              }
              return interatorCall(iterator, next);
            },
            end: (result: any) => {
              iteratorStack.length = 0;
              iteratorDone(iterator, true, result);
            },
          } as EffectContext);
        } catch (e) {
          return iteratorThrow(iterator, e as any);
        }
      }
    }

    throw new Error(`Unsupported yield ${typeof value}: ${value}`);
  }

  function iteratorNext(iterator: Iterator<any, T>, payload: any) {
    if (stale || flow.cancelled) return;
    if (childError) {
      return iteratorThrow(iterator, childError);
    }
    try {
      const { done, value } = iterator.next(payload);
      return iteratorDone(iterator, done, value);
    } catch (e) {
      return statusChanged("faulted", e, false);
    }
  }

  const flow: InternalFlow = {
    key,
    fn,
    controller,
    statusChanged,
    get hasData() {
      return hasData || false;
    },
    get current(): any {
      return controller.flow(key) || flow;
    },
    get parent() {
      return parent;
    },
    get previous() {
      return previous;
    },
    get data() {
      return data;
    },
    set data(value) {
      flow.update(value);
    },
    get status() {
      return status;
    },
    get error() {
      return error;
    },
    get stale() {
      return stale;
    },
    set stale(value: boolean) {
      // cannot turn stale to unstale
      if (stale) return;
      stale = value;
      controller.flowUpdated(flow);
      cleanup();
    },
    get cancelled() {
      return cancelled || parent?.cancelled || false;
    },
    on: emitter.on,
    cancel() {
      if (cancelled) return flow;
      cancelled = true;
      emitter.emit("cancel", flow);
      cleanup();
      return flow;
    },
    partial(partialData) {
      if (!isRunning()) return;
      data = partialData;
      hasData = true;
      controller.flowUpdated(flow);
    },
    start(...args: any[]) {
      // running or finished
      if (status !== "idle" && !stale) {
        return flow;
      }

      stale = false;

      if (flow.previous) {
        controller.replaceFlow(flow.previous, flow);
      }

      emitter.emit("start", flow);
      try {
        status = "running";
        const result = fn(...args);
        // promise
        if (result && typeof result.then === "function") {
          statusChanged("running", undefined, false);
          result.then(
            (resolved: any) => {
              statusChanged("completed", resolved, false);
            },
            (rejected: Error) => {
              statusChanged("faulted", rejected, false);
            }
          );
        }
        // iterator
        else if (result && typeof result.next === "function") {
          iteratorNext(result, undefined);
          if (isRunning()) {
            controller.flowUpdated(flow);
          }
        } else {
          statusChanged("completed", result, false);
        }
      } catch (e) {
        statusChanged("faulted", e, false);
      }
      return flow;
    },
    restart(...args: any[]) {
      if (status === "idle" || stale) {
        return flow.start(...args);
      }
      return createFlow({
        controller,
        parent,
        previous: flow,
        key,
        fn,
        onSuccess,
        onError,
        initData: data,
        hasData,
      }).start(...args);
    },
    update(value: any) {
      if (status !== "running") {
        if (typeof value === "function") {
          value = value(data);
        }
        statusChanged("completed", value, true);
      }
      return flow;
    },
    dispose() {
      if (disposed) return flow;
      disposed = true;
      cancelled = true;
      emitter.dispose();
      return flow;
    },
    onChildError(error) {
      childError = error;
    },
  };

  return flow;
}

export function makeKey(args: any[]) {
  return args.join(":");
}

export function getKey(fn: Function) {
  return (fn as any)?.flowKey || fn;
}

export interface FlowConfigs<T extends AnyFunc> {
  key?: string;
}

export function configure<T extends AnyFunc>(fn: T, key: string): T;
export function configure<T extends AnyFunc>(fn: T, configs: FlowConfigs<T>): T;
export function configure<T extends AnyFunc>(fn: T, configs: any): T {
  const { key }: FlowConfigs<T> =
    (typeof configs === "string" ? { key: configs } : configs) || {};

  if (typeof key !== "undefined") {
    (fn as any).flowKey = key;
  }

  return fn;
}

export function createEffect<T extends EffectContext = EffectContext>(
  fn: (context: T) => void
): Effect {
  return fn as any;
}

export function createEmitter<TPayload = any, TEvent = string>({
  wildcard,
  privateEventPrefix,
}: EmitterOptions<TEvent> = {}): Emitter<TPayload, TEvent> {
  const events = new Map<
    TEvent | typeof wildcard,
    ((payload: TPayload | { type: TEvent; payload: TPayload }) => void)[]
  >();

  function getHandlers(event: TEvent | typeof wildcard) {
    let handlers = events.get(event);
    if (!handlers) {
      handlers = [];
      events.set(event, handlers);
    }
    return handlers;
  }

  function on(...args: any[]): any {
    if (args.length > 1) {
      const [event, listener]: [
        TEvent | TEvent[],
        (payload: TPayload | { type: TEvent; payload: TPayload }) => void
      ] = args as any;
      const removes = (Array.isArray(event) ? event : [event]).map((event) => {
        const handlers = getHandlers(event);
        handlers.push(listener);
        let active = true;
        return () => {
          if (!active) return;
          active = false;
          const index = handlers.indexOf(listener);
          if (index !== -1) handlers.splice(index, 1);
          return listener;
        };
      });
      if (Array.isArray(event)) {
        return () => removes.forEach((x) => x);
      }
      return removes[0];
    }

    let cancel: Function = () => {};
    return Object.assign(
      new Promise<TPayload>((resolve) => {
        cancel = on(args[0], (payload: TPayload) => {
          cancel();
          resolve(payload);
        });
      }),
      { cancel }
    );
  }

  function emit(
    event: TEvent | typeof wildcard,
    payload?: TPayload | { type: TEvent; payload: TPayload }
  ) {
    try {
      const handlers = getHandlers(event);
      handlers.slice(0).forEach((handler) => handler(payload as any));
    } finally {
      if (
        wildcard &&
        event !== wildcard &&
        (!privateEventPrefix ||
          typeof event !== "string" ||
          privateEventPrefix !== event[0])
      ) {
        emit(wildcard, { type: event, payload } as any);
      }
    }
  }

  function dispose() {
    events.forEach((listeners) => {
      listeners.length = 0;
    });
    events.clear();
  }

  return { emit, on, dispose };
}

export const delay = (ms = 0): CancellablePromise => {
  let timeout: NodeJS.Timeout;
  return Object.assign(
    new Promise<void>((resolve) => (timeout = setTimeout(resolve, ms))),
    {
      cancel() {
        clearTimeout(timeout);
      },
    }
  );
};

export function listenerChain<T>(
  listenerFactory: (cleanup: VoidFn) => T,
  register: (
    listener: T,
    add: (removeListener: VoidFn) => typeof removeListener,
    cleanup: VoidFn
  ) => void
) {
  const removeListeners: Function[] = [];
  const cleanup = () => {
    removeListeners.forEach((x) => x());
  };

  register(
    listenerFactory(cleanup),
    (x) => {
      removeListeners.push(x);
      return x;
    },
    cleanup
  );

  return cleanup;
}

function isPlainObject(value: any) {
  return typeof value == "object" && value.constructor == Object;
}
