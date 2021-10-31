import {
  createFlow,
  listenerChain,
  InternalEffectContext,
  EffectContext,
  Effect,
  Flow,
  InternalFlow,
  createEffect,
  AnyFunc,
  FlowDataInfer,
  getKey,
  delay,
  FLOW_UPDATE_EVENT,
  NO_KEY,
} from "./main";

export interface Cancellable {}

export interface RetryOptions {
  max: number;
  delay?: number;
}

export function retry<T extends AnyFunc>(
  max: number,
  fn: T,
  ...args: Parameters<T>
): Effect;

export function retry<T extends AnyFunc>(
  options: RetryOptions,
  fn: T,
  ...args: Parameters<T>
): Effect;
export function retry<T extends AnyFunc>(
  inputOptions: any,
  fn: T,
  ...args: Parameters<T>
) {
  let options: RetryOptions = inputOptions;
  if (typeof inputOptions !== "object") {
    options = { max: inputOptions };
  }
  if (!options.max) {
    throw new Error(`Invalid RetryOptions. 'times' options is required`);
  }
  return (function* () {
    for (let i = 0; i < options.max; i++) {
      try {
        const result: ReturnType<T> = yield fn(...args);
        return result;
      } catch (e) {
        if (options.delay) {
          yield delay(options.delay);
        }
      }
    }
  })();
}

export function remove(key: string | AnyFunc | (string | AnyFunc)[]) {
  return createEffect((ec) => {
    if (Array.isArray(key)) {
      key.forEach((k) => ec.controller.remove(k));
    } else {
      ec.controller.remove(key);
    }
  });
}

export function debounce(ms: number) {
  return createEffect((ec) => {
    ec.call(function* () {
      // cancel previous
      yield cancel();
      // delay in specified time
      yield delay(ms);
    });
  });
}

export function block(): Effect;
export function block(value: boolean): Effect;
export function block(until: Date): Effect;
export function block(ms: number): Effect;
export function block(value: any = true) {
  return createEffect((ec: InternalEffectContext) => {
    ec.flow.setBlock(value);
    ec.next();
  });
}

export function cancel(): Effect;
export function cancel(cancellable: Cancellable): Effect;
export function cancel(key: string): Effect;
export function cancel(flow: AnyFunc): Effect;
export function cancel(target?: any): any {
  const hasTarget = !!arguments.length;
  return createEffect<InternalEffectContext>((ec) => {
    if (hasTarget) {
      // cancel flow by key
      if (typeof target === "function" || typeof target === "string") {
        ec.controller.cancelFlow(target);
      }
      // cancel cancellable object
      else if (
        typeof target === "object" &&
        typeof target.cancel === "function"
      ) {
        target?.cancel();
      } else {
        // throw error ?
      }
    } else {
      // cancel previous
      ec.flow.previous?.cancel();
    }
    ec.next();
  });
}

export function expiry(date: Date): Effect;
export function expiry(ms: number): Effect;
export function expiry(value: any) {
  return createEffect((ec: InternalEffectContext) => {
    ec.flow.on("end", () => {
      if (value instanceof Date) {
        ec.flow.setExpiry(value.getTime());
      } else {
        ec.flow.setExpiry(Date.now() + value);
      }
    });
    ec.next();
  });
}

export function stale(type: "when", done: Promise<any>): Effect;
export function stale(type: "when", date: Date): Effect;
export function stale(type: "when", timeout: number): Effect;
export function stale(
  type: "when",
  event: string | string[],
  check?: (payload: any) => boolean
): Effect;
export function stale(
  type: "flow",
  key: string | string[],
  check?: (flow: Flow) => boolean
): Effect;
export function stale<T extends AnyFunc>(
  type: "flow",
  flow: T,
  check?: (flow: Flow<T>) => boolean
): Effect;
export function stale(
  type: "flow",
  flow: AnyFunc[],
  check?: (flow: Flow) => boolean
): Effect;
export function stale(
  type: "when" | "flow",
  key: any,
  check?: (payload: any) => boolean
): any {
  return createEffect<InternalEffectContext>((ec) => {
    // stale('when', timeout)
    if (type === "when" && !isNaN(key)) {
      ec.flow.on("end", () => {
        ec.flow.setStale(Date.now() + key);
      });
    } else if (type === "when" && key instanceof Date) {
      ec.flow.on("end", () => {
        ec.flow.setStale(key.getTime());
      });
    }
    // stale('when', promise)
    else if (type === "when" && key && typeof key.then === "function") {
      ec.flow.on("end", () => {
        const called = ec.flow.called;
        const onDone = () => {
          if (called !== ec.flow.called) return;
          ec.flow.setStale(2);
        };
        if (typeof key.finally === "function") {
          key.finally(onDone);
        } else {
          key.then(onDone, onDone);
        }
      });
    } else {
      const events =
        type === "flow"
          ? [FLOW_UPDATE_EVENT]
          : Array.isArray(key)
          ? (key as string[])
          : [key as string];
      const keys = (
        type === "flow"
          ? Array.isArray(key)
            ? (key as any[])
            : [key]
          : undefined
      )?.map(getKey);

      ec.flow.on("end", () => {
        let called: number;
        listenerChain(
          (cleanup) => (payload: any) => {
            if (ec.flow.status === "running") {
              return;
            }

            if (ec.flow.called !== called) {
              cleanup();
              return;
            }

            if (type === "flow") {
              const flow = payload as Flow;
              if (keys && !keys.includes(flow.key)) return;
            }

            if (check && !check(payload)) {
              return;
            }

            cleanup();
            ec.flow.setStale(2);
          },
          (listener, add) => {
            called = ec.flow.called;
            add(ec.controller.on(events, listener));
          }
        );
      });
    }

    ec.next();
  });
}

export function partial(data: any, wait?: boolean) {
  return createEffect((ec: InternalEffectContext) => {
    ec.flow.partial(data, wait || false);
    if (wait) {
      ec.flow.setNext(ec.next);
    } else {
      ec.next();
    }
  });
}

export function callback(callback: AnyFunc): Effect {
  return createEffect((ec) => {
    ec.next((...args: any[]) => {
      if (ec.flow.cancelled || ec.flow.faulted) return;
      return ec.controller.run(callback, ...args);
    });
  });
}

export function on<T extends AnyFunc>(event: string | string[]): Effect;
export function on<T>(
  event: string | string[],
  flow: (payload: T) => void
): Effect;
export function on(event: string | string[], fn?: Function): any {
  const hasFlow = arguments.length > 1;
  return createEffect((ec) => {
    let latest: InternalFlow;
    const cancel = listenerChain(
      (cleanup) => (payload: any) => {
        if (!hasFlow) {
          cleanup();
          cancel?.();
          return ec.next(payload);
        }

        latest = createFlow({
          controller: ec.controller as any,
          parent: ec.flow as any,
          previous: latest,
          key: NO_KEY,
          fn,
          onError: ec.fail,
        });

        latest.start(payload);
      },
      (listener, add) => {
        add(ec.controller.on(event, listener));
      }
    );

    if (hasFlow) {
      return ec.next({ cancel });
    }
  });
}

export function emit(event: string, payload?: any): Effect {
  return createEffect((ec) => {
    ec.controller.emit(event, payload);
    ec.next();
  });
}

export function all(targets: { [key: string]: Effect }): Effect;
export function all(targets: Effect[]): Effect;
export function all(targets: any): any {
  return handleParallel("all", targets);
}

export function race(targets: { [key: string]: Effect }): Effect;
export function race(targets: Effect[]): Effect;
export function race(targets: any): any {
  return handleParallel("race", targets);
}

export function call<T extends AnyFunc>(fn: T, ...args: Parameters<T>) {
  return createEffect((ec) => {
    ec.call(fn, ...args);
  });
}

export function start<T extends AnyFunc>(
  flow: T,
  ...args: Parameters<T>
): Effect;
export function start<T extends AnyFunc>(
  key: [string, ...Parameters<T>],
  flow: T
): Effect;
export function start<T extends AnyFunc>(
  key: string,
  flow: T,
  ...args: Parameters<T>
): Effect;
export function start(...args: any[]) {
  return createEffect((ec) => {
    runFlow(ec, "start", args);
  });
}

export function run<T extends AnyFunc>(flow: T, ...args: Parameters<T>): Effect;
export function run<T extends AnyFunc>(
  key: [string, ...Parameters<T>],
  flow: T
): Effect;
export function run<T extends AnyFunc>(
  key: string,
  flow: T,
  ...args: Parameters<T>
): Effect;
export function run(...args: any[]) {
  return createEffect((ec) => {
    runFlow(ec, "run", args);
  });
}

export function restart<T extends AnyFunc>(
  flow: T,
  ...args: Parameters<T>
): Effect;
export function restart<T extends AnyFunc>(
  key: [string, ...Parameters<T>],
  flow: T
): Effect;
export function restart<T extends AnyFunc>(
  key: string,
  flow: T,
  ...args: Parameters<T>
): Effect;
export function restart(...args: any[]) {
  return createEffect((ec) => {
    runFlow(ec, "restart", args);
  });
}

export function fork<T extends AnyFunc>(flow: AnyFunc, ...args: Parameters<T>) {
  return createEffect((ec) => {
    const { cancel, start } = createFlow({
      controller: ec.controller as any,
      parent: ec.flow as any,
      key: NO_KEY,
      fn: flow,
    });
    start(...args);
    return ec.next({ cancel });
  });
}

export function spawn<T extends AnyFunc>(
  flow: T,
  ...args: Parameters<T>
): Effect {
  return createEffect((ec) => {
    const { cancel, start } = createFlow({
      controller: ec.controller as any,
      key: NO_KEY,
      fn: flow,
    });
    start(...args);
    return ec.next({ cancel });
  });
}

export function extra(value?: Record<string, any>): Effect {
  const hasValue = arguments.length;
  return createEffect((ec) => {
    if (hasValue) {
      Object.assign(ec.flow.extra, value);
    } else {
      ec.next(ec.flow.extra);
    }
  });
}

export function data(key: string, value: ((prev: any) => any) | any): Effect;
export function data<T extends AnyFunc>(
  flow: T,
  value: ((prev: FlowDataInfer<T>) => FlowDataInfer<T>) | FlowDataInfer<T>
): Effect;
export function data<T = any>(mergeFn: (current: T, previous?: T) => T): Effect;
export function data(): Effect;
export function data(...args: any[]): Effect {
  return createEffect((ec: InternalEffectContext) => {
    if (!args.length) {
      ec.next(ec.flow.previous?.data);
    } else if (args.length === 1) {
      ec.flow.setMerge(args[0]);
      ec.next();
    } else {
      const [key, value] = args;
      const flow = ec.controller.flow(key) as InternalFlow;
      if (flow?.key === ec.flow.key) {
        throw new Error("Cannot update running flow");
      }
      flow?.update(value);
      ec.next();
    }
  });
}

function runFlow(
  ec: EffectContext,
  method: "start" | "restart" | "run",
  args: any[]
) {
  const result = (ec.controller as any)[method](...args);

  if (method === "run") {
    return ec.next(result);
  }

  const onUpdate = () => {
    const current = result.current;
    if (current.status === "running") {
      return;
    }
    if (current.status === "faulted") {
      return ec.fail(current.error);
    }
    ec.next(current.data);
  };

  if (result.status !== "running" && result.status !== "idle") {
    return onUpdate();
  }

  const cleanup = ec.controller.on(FLOW_UPDATE_EVENT, (x: Flow) => {
    if (x.key !== result.key) return;
    cleanup();
    onUpdate();
  });

  ec.flow.on("end", cleanup);
}

function handleParallel(type: "all" | "race", targets: any) {
  const entries = Object.entries(targets);
  const isArray = Array.isArray(targets);
  return createEffect((ec: InternalEffectContext) => {
    let done = false;
    let count = 0;
    const flows = new Map<any, Flow>();
    const results: any = isArray ? [] : {};
    const cancelOthers = (current: any) => {
      flows.forEach((flow, key) => {
        if (key === current) return;
        flow.cancel();
      });
    };
    const onDone = (key: any, success: boolean, value: any) => {
      if (done) return;
      count++;
      if (!success) {
        done = true;
        cancelOthers(key);
        return ec.fail(value);
      }
      results[key] = value;
      if (type === "race") {
        done = true;
        cancelOthers(key);
        if (isArray) {
          return value;
        }
        return ec.next(results);
      } else if (count >= entries.length) {
        done = true;
        ec.next(results);
      }
    };
    entries.forEach(([key, target]) => {
      const fn = function* () {
        yield target;
      };
      const flow = createFlow({
        controller: ec.controller,
        parent: ec.flow,
        key: NO_KEY,
        fn,
        onSuccess: (data) => {
          onDone(key, true, data);
        },
        onError: (error) => {
          onDone(key, false, error);
        },
      });
      flows.set(key, flow);
      flow.start();
    });
  });
}
