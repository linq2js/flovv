export type FlowStatus = "idle" | "running" | "completed" | "faulted";

export type VoidFn = () => void;
export type AnyFunc = (...args: any[]) => any;

export const FLOW_UPDATE_EVENT = "#flow";
export const GLOBAL_STATUS_EVENT = "#status";

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
  readonly idle: boolean;
  readonly running: boolean;
  readonly completed: boolean;
  readonly faulted: boolean;
  readonly error: Error | undefined;
  readonly previous: Flow<T> | undefined;
  readonly parent: Flow | undefined;
  readonly cancelled: boolean;
  readonly current: this;
  readonly hasData: boolean;
  readonly extra: Record<string, any>;
  readonly expiry: number;
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
  next(payload?: any): this;
}

export interface InternalFlow<T extends AnyFunc = any> extends Flow<T> {
  readonly fn: Function;
  readonly parent: InternalFlow | undefined;
  readonly controller: InternalFlowController;
  readonly called: number;
  setStale(value: number): void;
  setMerge(
    mergeFn: (
      current: FlowDataInfer<T>,
      previous?: FlowDataInfer<T>
    ) => FlowDataInfer<T>
  ): void;
  setExpiry(value: number): void;
  setNext(next: Function): void;
  partial(data: any, wait: boolean): this;
  statusChanged(status: FlowStatus, value: any, forceUpdate: boolean): void;
  onChildError(error: Error): void;
}

export type FlowTypeInfer<T> = T extends (...args: any[]) => Generator<Effect>
  ? T
  : T extends (...args: any[]) => Generator<any>
  ? never
  : T;

export interface FlowExecutor {
  <T extends AnyFunc>(flow: T, ...args: Parameters<T>): Flow<T>;
  <T extends AnyFunc>(key: [string, ...Parameters<T>], flow: T): Flow<T>;
  <T extends AnyFunc>(key: string, flow: T, ...args: Parameters<T>): Flow<T>;
}

export interface FlowController {
  readonly ready: boolean;
  readonly promise: Promise<void>;
  readonly error?: Error;
  start: FlowExecutor;
  restart: FlowExecutor;
  run<T extends AnyFunc>(
    flow: T,
    ...args: Parameters<T>
  ): CancellablePromise<ReturnType<T>>;
  flow<T extends AnyFunc>(key: string, flow: T): Flow<T>;
  flow<T extends AnyFunc>(flow: T): Flow<T>;
  flow(key: string): Flow | undefined;
  emit(event: string, payload?: any): void;
  remove(key: string | AnyFunc): void;
  on(
    event: typeof FLOW_UPDATE_EVENT | string | string[],
    listener: (payload: any) => void
  ): VoidFn;
  gc(): void;
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
  gcInterval?: number;
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
  extra?: Record<string, any>;
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
  gcInterval = 60000,
}: ControllerOptions = {}): FlowController {
  let data = { ...initData };
  let promise = Promise.resolve();
  let ready = true;
  let error: Error;
  let gcTimeout: NodeJS.Timeout;
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
    flow(key: any, fn?: any): any {
      const keyType = typeof key;
      if (keyType === "function") {
        fn = key;
      }
      key = getKey(key);
      // flow(key)
      if (keyType !== "function" && arguments.length === 1) {
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

        if (hasData) {
          emitter.emit(FLOW_UPDATE_EVENT, flow);
        }
      }
      return flow;
    },
    remove(key: any) {
      key = getKey(key);
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
    run(fn, ...args) {
      let cancel: () => void;
      return Object.assign(
        new Promise<ReturnType<typeof fn>>((resolve, reject) => {
          const flow = createFlow({ controller, fn, key: {} });
          flow.on("end", () => {
            if (flow.faulted) {
              return reject(flow.error);
            }
            return resolve(flow.data);
          });
          cancel = flow.cancel;
          flow.start(...args);
        }),
        {
          cancel() {
            cancel?.();
          },
        }
      );
    },
    gc() {
      clearTimeout(gcTimeout);
      gc();
    },
  };

  function gc() {
    flows.forEach((flow, key) => {
      if (flow.expiry && flow.expiry <= Date.now()) {
        flows.delete(key);
      }
    });
    if (gcInterval) {
      gcTimeout = setTimeout(gc, gcInterval);
    }
  }

  function run(type: "start" | "restart", inputs: any[]) {
    const args: any[] = [];
    const key = getKey(inputs[0]);
    let fn: any;
    // preload(flow, ...args)
    if (typeof inputs[0] === "function") {
      fn = inputs[0];
      args.push(...inputs.slice(1));
    } else {
      // preload(key, flow, ...args)
      fn = inputs[1];
      if (Array.isArray(inputs[0])) {
        args.push(...inputs[0].slice(1));
      } else {
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
          reject(error);
        },
      }).start();
    });
  }

  gc();

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
  extra = {},
}: FlowOptions<T>) {
  let stale: number = 0;
  let status: FlowStatus = initStatus;
  let error: Error;
  let childError: Error;
  let data: FlowDataInfer<T> | undefined = initData;
  let cancelled = false;
  let disposed = false;
  let called = 0;
  let currentNext: Function | undefined;
  let cancelFn: Function | undefined;
  let expiry = 0;
  let mergeFn:
    | ((
        current: FlowDataInfer<T>,
        previous?: FlowDataInfer<T>
      ) => FlowDataInfer<T>)
    | undefined;

  const iteratorStack: any[] = [];
  const emitter = createEmitter();

  function cleanup() {
    previous = undefined;
    emitter.emit("end");
    emitter.dispose();
  }

  function isExpired() {
    return expiry && expiry <= Date.now();
  }

  function isRunning() {
    return (
      !disposed &&
      !isStale(true) &&
      !isExpired() &&
      !flow.cancelled &&
      status === "running"
    );
  }

  function statusChanged(
    newStatus: FlowStatus,
    value: any,
    forceUpdate: boolean
  ) {
    if (!forceUpdate && !isRunning()) return;
    stale = 0;
    status = newStatus;
    cancelFn = undefined;
    if (newStatus === "completed") {
      hasData = true;
      if (mergeFn) {
        data = mergeFn(value, data);
      } else {
        data = value;
      }
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

  function iteratorThrow(iterator: Iterator<any, T>, error: Error): void {
    if (!isRunning()) return;
    try {
      const { done, value } = iterator.throw?.(error) || {};
      // error handled
      return iteratorDone(iterator, done, value);
    } catch (e) {
      if (iteratorStack.length) {
        return iteratorThrow(iteratorStack.pop(), e as Error);
      }
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
    cancelFn = undefined;
    if (value) {
      // yield iterator
      if (typeof value.next === "function") {
        return interatorCall(iterator, value);
      }
      // yield promise
      if (value && typeof value.then === "function") {
        cancelFn = value.cancel;
        return value.then(
          (resolved: any) => {
            iteratorNext(iterator, resolved);
          },
          (rejected: any) => {
            iteratorThrow(iterator, rejected);
          }
        );
      }

      if (typeof value === "function") {
        try {
          const c = called;
          const ec: EffectContext = {
            flow,
            controller,
            context: controller.context,
            next: (value: any) => {
              if (c !== called) {
                return;
              }
              iteratorNext(iterator, value);
            },
            fail: (error: any) => {
              if (c !== called) {
                return;
              }
              iteratorThrow(iterator, error);
            },
            call: (next: any, ...args: any[]) => {
              if (c !== called) {
                return;
              }
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
              if (c !== called) {
                return;
              }
              iteratorStack.length = 0;
              iteratorDone(iterator, true, result);
            },
          };

          return value(ec);
        } catch (e) {
          return iteratorThrow(iterator, e as any);
        }
      }
    }

    throw new Error(`Unsupported yield ${typeof value}: ${value}`);
  }

  function iteratorNext(iterator: Iterator<any, T>, payload: any) {
    if (!isRunning()) return;
    if (childError) {
      return iteratorThrow(iterator, childError);
    }
    try {
      const { done, value } = iterator.next(payload);
      return iteratorDone(iterator, done, value);
    } catch (e) {
      iteratorThrow(iterator, e as Error);
    }
  }

  function isStale(triggerUpdated: boolean) {
    const now = Date.now();
    if (stale !== 0 && stale !== 1 && stale <= now) {
      // mark as stale and do not trigger updated
      stale = 1;
      if (triggerUpdated) {
        controller.flowUpdated(flow);
      }
      cleanup();
    }
    return stale !== 0 && stale <= now;
  }

  const flow: InternalFlow<T> = {
    key,
    fn,
    controller,
    statusChanged,
    get expiry() {
      return expiry;
    },
    get extra() {
      return extra;
    },
    get called() {
      return called;
    },
    get completed() {
      return status === "completed";
    },
    get faulted() {
      return status === "faulted";
    },
    get running() {
      return status === "running";
    },
    get idle() {
      return status === "idle";
    },
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
      flow.update(value as any);
    },
    get status() {
      return status;
    },
    get error() {
      return error;
    },
    get stale() {
      return isStale(false);
    },
    setExpiry(value) {
      expiry = value;
    },
    setMerge(value) {
      mergeFn = value;
    },
    setStale(value: number) {
      // cannot turn stale to unstale
      if (stale !== 0 && stale < value) return;
      stale = value;
      isStale(true);
    },
    get cancelled() {
      return cancelled || parent?.cancelled || false;
    },
    on: emitter.on,
    cancel() {
      if (cancelled) return flow;
      cancelled = true;
      cancelFn?.();
      emitter.emit("cancel", flow);
      cleanup();
      return flow;
    },
    partial(partialData, wait) {
      if (!isRunning()) return flow;
      data = partialData;
      hasData = true;
      if (wait) {
        status = "completed";
      }
      controller.flowUpdated(flow);
      return flow;
    },
    start(...args: any[]) {
      // running or finished
      if (status !== "idle" && !isStale(false) && !isExpired()) {
        return flow;
      }

      cancelFn = undefined;
      cancelled = false;
      mergeFn = undefined;
      stale = 0;
      expiry = 0;
      called++;

      if (flow.previous) {
        controller.replaceFlow(flow.previous, flow);
      }

      emitter.emit("start", flow);
      try {
        status = "running";
        const result = fn(...args);
        // promise
        if (result && typeof result.then === "function") {
          cancelFn = result.cancel;
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
    restart(...args) {
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
        extra,
      }).start(...args);
    },
    update(value: any) {
      if (status !== "running") {
        if (typeof value === "function") {
          value = value(data);
        }
        mergeFn = undefined;
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
    setNext(value: Function) {
      currentNext = value;
    },
    next(payload: any) {
      if (!cancelled && !isStale(true) && currentNext) {
        const next = currentNext;
        currentNext = undefined;
        status = "running";
        next?.call(null, payload);
        if (status === "running") {
          controller.flowUpdated(flow);
        }
      }
      return flow;
    },
  };

  return flow;
}

export function makeKey(args: any[]) {
  return args.join(":");
}

export function getKey(value: any) {
  if (typeof value === "function") {
    return value.flowKey || value;
  }
  if (Array.isArray(value)) {
    return makeKey(value);
  }
  return value;
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
