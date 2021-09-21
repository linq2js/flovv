import {
  createFlow,
  listenerChain,
  InternalEffectContext,
  Effect,
  Flow,
  InternalFlow,
  createEffect,
  AnyFunc,
  FlowDataInfer,
} from "./flovv";

export interface Cancellable {}

export function cancel(): Effect;
export function cancel(cancellable: Cancellable): Effect;
export function cancel(key: string): Effect;
export function cancel(flow: AnyFunc): Effect;
export function cancel(target?: any): any {
  const hasTarget = !!arguments.length;
  return createEffect<InternalEffectContext>((ec) => {
    if (hasTarget) {
      if (typeof target === "function" || typeof target === "string") {
        ec.controller.cancelFlow(target);
      } else if (
        typeof target === "object" &&
        typeof target.cancel === "function"
      ) {
        target?.cancel();
      }
    } else {
      // cancel previous
      ec.flow.previous?.cancel();
    }
    ec.next();
  });
}

export function stale(event: "flow", key: string): Effect;
export function stale(
  event: string | string[],
  check?: (payload: any) => boolean
): Effect;
export function stale<T>(flow: AnyFunc): Effect;
export function stale<T>(flow: AnyFunc, check: (data: T) => boolean): Effect;
export function stale<T>(
  flow: AnyFunc,
  key: string,
  check: (data: T) => boolean
): Effect;
export function stale(...args: any): any {
  return createEffect<InternalEffectContext>((ec) => {
    let [event, check]: [string | string[], (payload: any) => boolean] =
      typeof args[0] === "string" || Array.isArray(args[0])
        ? args
        : ["update", (flow: Flow) => flow.key === args[0]];

    if (typeof args[0] === "string") {
      listenerChain(
        (cleanup) => (payload: any) => {
          if (
            check &&
            !(typeof check === "string"
              ? payload.key === check
              : check(payload))
          )
            return;
          cleanup();
          ec.flow.stale = true;
        },
        (listener, add, cleanup) => {
          add(ec.flow.on("cleanup", cleanup));
          if (typeof event === "string") {
            add(ec.controller.on(event, listener));
          } else {
            event.forEach((e) => add(ec.controller.on(e, listener)));
          }
        }
      );
      ec.next();
      return;
    }

    ec.next();
  });
}

export function on<T extends AnyFunc>(event: string | string[]): Effect;
/**
 * handle the event that triggers by the flow controller and start the specified flow with new context
 * @param event
 * @param flow
 * @param args
 */
export function on<T extends AnyFunc>(
  event: string | string[],
  flow: T,
  ...args: Parameters<T>
): Effect;
export function on(event: string | string[], ...args: any[]): any {
  const hasFlow = args.length > 1;
  return createEffect((ec) => {
    let latest: InternalFlow;
    const cancel = listenerChain(
      () => (payload: any) => {
        if (!hasFlow) {
          cancel?.();
          return ec.next(payload);
        }

        latest = createFlow(
          ec.controller as any,
          ec.flow as any,
          latest,
          {},
          args[0],
          undefined,
          ec.fail
        ).start(payload, ...args.slice(1));
      },
      (listener, add, cleanup) => {
        add(ec.flow.on("cleanup", cleanup));
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

export function fork<T extends AnyFunc>(flow: AnyFunc, ...args: Parameters<T>) {
  return createEffect((ec) => {
    const { cancel, start } = createFlow(
      ec.controller as any,
      ec.flow as any,
      undefined,
      {},
      flow
    );
    start(...args);
    return ec.next({ cancel });
  });
}

export function spawn<T extends AnyFunc>(
  flow: T,
  ...args: Parameters<T>
): Effect {
  return createEffect((ec) => {
    const { cancel, start } = createFlow(
      ec.controller as any,
      undefined,
      undefined,
      {},
      flow
    );
    start(...args);
    return ec.next({ cancel });
  });
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
      const flow = createFlow(
        ec.controller,
        ec.flow,
        undefined,
        {},
        fn,
        (data) => {
          onDone(key, true, data);
        },
        (error) => {
          onDone(key, false, error);
        }
      );
      flows.set(key, flow);
      flow.start();
    });
  });
}

export function update(key: string, value: ((prev: any) => any) | any): Effect;
export function update<T extends AnyFunc>(
  flow: T,
  value: ((prev: FlowDataInfer<T>) => FlowDataInfer<T>) | FlowDataInfer<T>
): Effect;
export function update(key: any, value: any) {
  return createEffect((ec) => {
    const flow = ec.controller.flow(key) as InternalFlow;
    if (flow?.key === ec.flow.key) {
      throw new Error("Cannot update running flow");
    }
    flow?.update(value);
    ec.next();
  });
}
