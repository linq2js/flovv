const EMPTY_OBJECT = {};
//  const EMPTY_ARRAY = [];
const NOOP = () => {};
export const CHANGE_EVENT = "#change";
export const READY_EVENT = "#ready";
export const FAIL_EVENT = "#fail";

function processNext(iterator, payload) {
  if (!iterator) return { done: true };
  if (typeof iterator.next !== "function") {
    throw new Error(`Expect iterator but got ${typeof iterator}`);
  }
  try {
    return iterator.next(payload);
  } catch (error) {
    return { error };
  }
}

export function processFlow(
  iterator,
  payload,
  commands = EMPTY_OBJECT,
  task = createTask()
) {
  if (task.cancelled || task.error) return;
  const { value, done, error } = processNext(iterator, payload);
  if (error) {
    return task.fail(error);
  }
  if (done) {
    return task.success(value);
  }

  if (!value || typeof value !== "object") {
    throw new Error("Expression must be object type");
  }
  const next = (result, override = EMPTY_OBJECT) =>
    processFlow(
      override.iterator || iterator,
      result,
      override.commands || commands,
      override.task || task
    );
  return processExpression(value, task, commands, next);
}

function processFork(fork, commands, task, next) {
  // fork expression
  if (
    !Array.isArray(fork) &&
    typeof fork === "object" &&
    typeof fork.next !== "function"
  ) {
    const forkedTask = createTask(undefined, undefined, task.fail);
    processExpression(fork, forkedTask, commands, forkedTask.success);
    return next(forkedTask);
  }

  // fork iterators
  const isMultipleFork = typeof fork.next !== "function";
  const forks = isMultipleFork ? Object.entries(fork) : [[0, fork]];
  const childTasks = isMultipleFork ? (Array.isArray(fork) ? [] : {}) : {};
  forks.forEach(([key, forkedIterator]) => {
    // cancel forked flow
    const forkedTask = createTask(undefined, undefined, task.fail);
    // fork iterator
    processFlow(forkedIterator, undefined, commands, forkedTask);
    childTasks[key] = forkedTask;
  });
  return next(isMultipleFork ? childTasks : childTasks[0]);
}

function processExpression(expression, task, commands, next) {
  if (Array.isArray(expression)) {
    const expList = expression;
    const results = [];
    const nextExpression = (result) => {
      if (task.cancelled || task.disposed || task.error) return;
      if (result !== NOOP) {
        results.push(result);
      }
      if (!expList.length) return next(results);
      return processExpression(expList.shift(), task, commands, nextExpression);
    };

    return nextExpression(NOOP);
  }

  // is iterator
  if (typeof expression.next === "function") {
    return processFlow(expression, undefined, commands, task.child(next));
  }

  // is promise
  if (typeof expression.then === "function") {
    return task.wrap(expression, next);
  }

  if (expression.fork) {
    return processFork(expression.fork, commands, task, next);
  }

  if (expression.all || expression.done || expression.any) {
    return processAsync(
      expression.all ? "all" : expression.done ? "done" : "any",
      expression.all || expression.done || expression.any,
      task,
      commands,
      next
    );
  }

  if ("debounce" in expression) {
    const { ms, when, flow, payload } = expression.debounce;
    let forkedTask;
    const inner = function* () {
      yield { delay: ms };
      if (typeof flow === "function") {
        yield* flow(payload);
      } else {
        yield flow;
      }
    };
    const outer = function* () {
      while (true) {
        yield { when: typeof when === "function" ? when() : when };
        if (forkedTask) forkedTask.cancel();
        forkedTask = yield {
          fork: inner(),
        };
      }
    };
    return processFork(outer(), commands, task, next);
  }

  if ("throttle" in expression) {
    const { ms, when, flow, payload } = expression.throttle;
    let executing = false;
    const inner = function* () {
      const start = new Date().getTime();
      try {
        if (typeof flow === "function") {
          yield* flow(payload);
        } else {
          yield flow;
        }
        const offset = new Date().getTime() - start;
        if (offset < ms) {
          yield { delay: ms - offset };
        }
        yield { delay: ms };
      } finally {
        executing = false;
      }
    };
    const outer = function* () {
      while (true) {
        yield { when: typeof when === "function" ? when() : when };
        if (executing) continue;
        executing = true;
        yield { fork: inner() };
      }
    };
    return processFork(outer(), commands, task, next);
  }

  if ("use" in expression) {
    // custom commands
    return next(undefined, {
      commands: Object.assign(
        {},
        ...(Array.isArray(expression.use) ? expression.use : [expression.use])
      ),
    });
  }

  if ("call" in expression) {
    const [fn, ...args] = Array.isArray(expression.call)
      ? expression.call
      : [expression.call];
    if (typeof fn !== "function") {
      throw new Error(
        `Invalid call expression. Expect a function but got ${typeof fn}`
      );
    }
    const result = fn(...args);
    if (result && typeof result.then === "function") {
      return task.wrap(result, next);
    }

    return next(result);
  }

  if ("delay" in expression) {
    const timer = setTimeout(() => {
      removeDisposeListener();
      next();
    }, expression.delay || 0);
    const removeDisposeListener = task.onDispose(() => clearTimeout(timer));
    return;
  }

  if ("task" in expression) {
    return task[expression.task]();
  }

  const keys = Object.keys(expression);

  if (keys.length !== 1 || !(keys[0] in commands)) {
    throw new Error(
      `Expect { ${Object.keys(commands).join(
        "|"
      )}: payload } but got {${keys.join(",")}}`
    );
  }

  const key = keys[0];
  const childTask = task.child(next);
  const commandResult = commands[key](
    expression[key],
    childTask,
    commands,
    next,
    (exp) => {
      if (!exp) return next();
      return processExpression(exp, task, commands, next);
    }
  );
  return commandResult;
}

function processAsync(mode, target, task, commands, next) {
  const results = Array.isArray(target) ? [] : {};
  const entries = Object.entries(target);
  const removeDiposeListeners = [];
  const childTasks = [];
  let count = 0;

  function dispose() {
    removeDiposeListeners.forEach((x) => x());
  }

  function handleChange(key, result, error, childTask) {
    count++;
    results[key] = mode === "done" ? { result, error } : result;
    if (error && mode !== "done") {
      dispose();
      return task.fail(error);
    }
    if (mode === "any" || count >= entries.length) {
      dispose();
      if (mode === "any") {
        childTasks.forEach((x) => {
          if (x !== childTask) {
            x.cancel();
          }
        });
      }
      return next(results);
    }
  }

  entries.forEach(([key, expression]) => {
    const childTask = task.child(
      (result) => handleChange(key, result, undefined, childTask),
      (error) => handleChange(key, undefined, error, childTask)
    );
    childTasks.push(childTask);
    removeDiposeListeners.push(task.onDispose(childTask.dispose));
    processExpression(expression, childTask, commands, childTask.success);
  });
}

function createEmitter() {
  const events = new Map();

  function getHandlers(event) {
    let handlers = events.get(event);
    if (!handlers) {
      handlers = [];
      events.set(event, handlers);
    }
    return handlers;
  }

  function on(event, handler) {
    const handlers = getHandlers(event);
    handlers.push(handler);
    let active = true;
    return function () {
      if (!active) return;
      active = false;
      const index = handlers.indexOf(handler);
      if (index !== -1) handlers.splice(index, 1);
      return handler;
    };
  }

  function emit(event, payload) {
    const handlers = getHandlers(event);
    handlers.slice(0).forEach((handler) => handler(payload));
  }

  function dispose() {
    events.forEach((handlers) => {
      handlers.length = 0;
    });
    events.clear();
  }

  return { emit, on, dispose };
}

export function createStore({
  state: initialState = EMPTY_OBJECT,
  init,
  context = {},
  commands: customCommands,
} = EMPTY_OBJECT) {
  let initTask;
  let ready = false;
  const flows = new Map();
  const tokens = {};
  const emitter = createEmitter();
  const executedFlows = new WeakSet();
  const commands = {
    ...customCommands,
    context(payload, task) {
      const isMultiple = Array.isArray(payload);
      if (typeof payload === "string" || isMultiple) {
        const values = (isMultiple ? payload : [payload]).map(
          (prop) => context[prop]
        );
        return task.success(isMultiple ? values : values[0]);
      }
      if (!payload || typeof payload !== "object") {
        throw new Error("Invalid context payload");
      }
      context = { ...context, ...payload };
      task.success(context);
    },
    select(payload, task) {
      const isMultiple = Array.isArray(payload);
      const results = (isMultiple ? payload : [payload]).map((selector) =>
        selector(currentState)
      );
      task.success(isMultiple ? results : results[0]);
    },
    flow(payload, task) {
      const isMultiple = Array.isArray(payload);
      const flowArray = (isMultiple ? payload : [payload]).map((x) =>
        getFlow(x)
      );
      return task.success(isMultiple ? flowArray : flowArray[0]);
    },
    start(payload, task) {
      const [fn, p] = Array.isArray(payload) ? payload : [payload];
      return getFlow(fn).start(p, task);
    },
    restart(payload, task) {
      const [fn, p] = Array.isArray(payload) ? payload : [payload];
      return getFlow(fn).restart(p, task);
    },
    once(payload, task) {
      const flows = Array.isArray(payload) ? payload : [payload];

      function next() {
        let flow;
        while (flows.length) {
          flow = flows.shift();
          if (executedFlows.has(flow)) continue;
          executedFlows.add(flow);
          processFlow(flow(), undefined, commands, task.child(next));
          return;
        }

        task.success();
      }
      next();
    },
    set(payload, task) {
      if (Array.isArray(payload)) {
        if (typeof payload[0] === "function") {
          return updateFlowData(payload[0], payload[1], task);
        }
        payload = { [payload[0]]: payload[1] };
      }
      let nextState = currentState;
      let error;
      const promises = [];
      try {
        const changeTokens = {};
        Object.entries(payload).forEach(([prop, value]) => {
          if (typeof value === "function") {
            value = value(currentState[prop]);
          }
          if (value && typeof value.then === "function") {
            changeTokens[prop] = tokens[prop] = {};
            promises.push(
              task.wrap(value, (result) => {
                if (
                  changeTokens[prop] !== tokens[prop] ||
                  currentState[prop] === result
                ) {
                  return;
                }
                currentState[prop] = result;
                handleChange();
              })
            );
            return;
          }
          if (value !== currentState[prop]) {
            if (nextState === currentState) {
              nextState = { ...nextState };
            }
            nextState[prop] = value;
          }
        });
      } catch (e) {
        error = e;
        return task.fail(e);
      } finally {
        if (nextState !== currentState) {
          currentState = nextState;
          handleChange();
        }
        if (!error && promises.length) {
          Promise.all(promises).then(task.success).catch(task.fail);
        } else {
          task.success();
        }
      }
    },
    emit(payload) {
      if (payload && typeof payload === "object") {
        Object.keys(payload).forEach((key) => {
          emitter.emit(key, payload[key]);
        });
      } else if (typeof payload === "string") {
        emitter.emit(payload);
      }
    },
    on(payload, task, commands) {
      const entries = Object.entries(payload);
      const results = {};
      entries.forEach(([event, flow]) => {
        const childTask = task.child();
        childTask.onDispose(
          emitter.on(event, (e) => {
            if (typeof flow === "function") {
              processFlow(flow(e), undefined, commands, task);
            } else if (Array.isArray(flow)) {
              processFlow(flow[0](flow[1]), undefined, commands, task);
            } else {
              processExpression(flow, task, commands, NOOP);
            }
          })
        );
        results[event] = childTask;
        // dispose child task once parent task disposed
        task.onDispose(childTask.dispose);
      });
      task.success(results);
    },
    when(payload, task) {
      const events =
        typeof payload === "string" || typeof payload === "function"
          ? [[payload, undefined]]
          : Array.isArray(payload)
          ? payload.map((x) => [x, undefined])
          : Object.entries(payload);
      const removeListeners = events.map(([target, check]) => {
        if (typeof target === "string") {
          return emitter.on(target, (e) => {
            if (typeof check === "function" && !check(e)) return;
            cleanup();
            task.success(e);
          });
        }
        // when: flow => watch flow state
        if (typeof target === "function") {
          const f = getFlow(target);
          const prev = {
            data: f.data,
            status: f.status,
            error: f.error,
          };
          return f.watch(() => {
            if (f.disposed) {
              return cleanup();
            }
            if (
              f.data !== prev.data ||
              f.status !== prev.status ||
              f.error !== prev.error
            ) {
              cleanup();
              task.success(f);
            }
          });
        }
        throw new Error(`Not support event listening for ${typeof target}`);
      });

      let removeDisposeListener = task.onDispose(cleanup);

      function cleanup() {
        removeDisposeListener();
        removeListeners.forEach((x) => x());
      }
    },
  };
  let currentState = initialState;
  const fnCache = new Map();

  function getState() {
    return currentState;
  }

  function updateFlowData(flowFn, data, task) {
    const flow = getFlow(flowFn);
    const result = flow.$$update(data);
    if (result && typeof result.then === "function") {
      return result.then(task.success, task.fail);
    }
    task.success(flow.data);
  }

  function handleChange() {
    flows.forEach((flow) => {
      flow.$$stateChange(currentState);
    });
    emitter.emit(CHANGE_EVENT, currentState);
  }

  function watch(watcher) {
    return emitter.on(CHANGE_EVENT, watcher);
  }

  function getFlow(fn) {
    if (typeof fn === "string") {
      const cacheKey = fn.replace(/\s+/g, "");
      let cachedFn = fnCache.get(cacheKey);
      if (!cachedFn) {
        const states = cacheKey.split(",");
        if (states.length === 1) {
          const state = states[0];
          cachedFn = function* () {
            return yield { ref: state };
          };
        } else {
          cachedFn = function* () {
            return yield { ref: states };
          };
        }
        fnCache.set(cacheKey, cachedFn);
      }
      fn = cachedFn;
    }

    let f = flows.get(fn);
    if (!f) {
      f = createFlow(fn, getState, getFlow, commands);
      flows.set(fn, f);
    }
    return f;
  }

  function start(fn, payload) {
    return getFlow(fn).start(payload).data;
  }

  function restart(fn, payload) {
    return getFlow(fn).restart(payload).data;
  }

  if (typeof init === "function") {
    initTask = createTask(
      undefined,
      () => {
        ready = true;
        emitter.emit(READY_EVENT);
      },
      () => emitter.emit(FAIL_EVENT)
    );
    commands.once(init, initTask);
  } else {
    ready = true;
    emitter.emit(READY_EVENT);
  }

  return {
    get state() {
      return getState();
    },
    get status() {
      return initTask ? initTask.status : "success";
    },
    get error() {
      return initTask && initTask.error;
    },
    ready(listener) {
      if (!ready) return emitter.on(READY_EVENT, listener);
      listener();
      return NOOP;
    },
    on: emitter.on,
    emit: emitter.emit,
    watch,
    flow: getFlow,
    start,
    restart,
  };
}

export function createTask(parent, onSuccess, onError) {
  let cancelled = false;
  let disposed = false;
  let status = false;
  let error;
  let result;
  const emitter = createEmitter();

  const task = {
    get cancelled() {
      return cancelled || (parent && parent.cancelled);
    },
    get status() {
      return status;
    },
    get error() {
      return error;
    },
    get result() {
      return result;
    },
    cancel() {
      if (cancelled) return;
      cancelled = true;
      emitter.emit("cancel");
      task.dispose();
    },
    dispose() {
      if (status || disposed) return;
      disposed = true;
      emitter.emit("dispose");
    },
    onDispose(listener) {
      if (disposed) {
        try {
          listener();
        } catch (e) {
          //
        }
        return NOOP;
      }
      if (status || disposed) return NOOP;

      return emitter.on("dispose", listener);
    },
    onCancel(listener) {
      if (task.cancelled) {
        try {
          listener();
        } catch (e) {
          //
        }
        return NOOP;
      }
      if (status || disposed) return NOOP;
      return emitter.on("cancel", listener);
    },
    success(value) {
      if (status || disposed || task.cancelled) return;
      status = "success";
      result = value;
      return onSuccess && onSuccess(value);
    },
    fail(value) {
      if (status || disposed || task.cancelled) return;
      status = "fail";
      error = value;
      if (onError) return onError(value);
      if (parent) return parent.fail(value);
      throw value;
    },
    child(onSuccess, onError) {
      return createTask(task, onSuccess, onError);
    },
    wrap(promise, onSuccess, onError) {
      const props = {};
      const removeListeners = [task.onCancel(cancel), task.onDispose(dispose)];

      function cancel() {
        if (props.cancelld) return;
        props.cancelled = true;
        promise.cancel && promise.cancel();
        dispose();
      }

      function dispose() {
        if (props.disposed) return;
        props.disposed = true;
        promise.dispose && promise.dispose();
        removeListeners.forEach((x) => x());
      }

      return Object.assign(
        promise
          .then((result) => {
            if (
              task.cancelled ||
              disposed ||
              status ||
              props.disposed ||
              props.cancelled
            )
              return;
            dispose();
            return onSuccess && onSuccess(result);
          })
          .catch((error) => {
            if (
              task.cancelled ||
              disposed ||
              status ||
              props.disposed ||
              props.cancelled
            )
              return;
            dispose();
            if (onError) return onError(error);
            return task.fail(error);
          }),
        {
          cancel,
          dispose,
        }
      );
    },
  };

  return task;
}

export function createFlow(fn, getState, getFlow, commands) {
  let stale = true;
  let status = undefined;
  let previousTask;
  let currentTask = createTask();
  let data;
  let error;
  let promise;
  const dependencyFlows = new Set();
  const dependencyProps = new Map();
  const emitter = createEmitter();
  const flow = {
    get status() {
      return status;
    },
    get stale() {
      return stale;
    },
    get data() {
      return data;
    },
    get error() {
      return error;
    },
    then: (onResolve, onReject) => getPromise().then(onResolve, onReject),
    catch: (onReject) => getPromise().catch(onReject),
    cancel,
    $$stateChange: handleStateChange,
    $$update(value) {
      if (status === "loading") {
        return getPromise().finally(() => flow.$$update(value));
      }
      currentTask = createTask();
      status = "success";
      data = typeof value === "function" ? value(data) : value;
      error = null;
      notifyChange();
    },
    start,
    restart,
    watch,
    dispose,
  };

  commands = {
    ...commands,
    ref(payload, task) {
      return resolveValues(true, payload, task);
    },
    get(payload, task) {
      return resolveValues(false, payload, task);
    },
    cancel(payload, task) {
      if (payload) {
        if (payload === "previous") {
          previousTask && previousTask.cancel();
        } else if (typeof payload === "function") {
          getFlow(payload).cancel();
        } else {
          currentTask.cancel();
        }
      }
      return task.success();
    },
  };

  function resolveValues(isRef, payload, task) {
    const isMultiple = Array.isArray(payload);
    const targetArray = isMultiple ? payload : [payload];
    const values = [];
    const flows = [];
    const props = [];

    targetArray.forEach((target, index) => {
      // get value and track the prop
      if (typeof target === "string") {
        return props.push([index, target]);
      }
      const flow = getFlow(target);
      flows.push([index, flow]);
      flow.start();
    });

    resolveFlowData(flows, values, (error) => {
      if (isRef) {
        flows.forEach(([, flow]) => {
          if (dependencyFlows.has(flow)) return;
          dependencyFlows.add(flow);
          flow.watch(handleFlowChange);
        });
        props.forEach(([index, prop]) =>
          dependencyProps.set(prop, values[index])
        );
      }
      if (error) return task.fail(error);
      resolveStateValues(props, values);
      task.success(isMultiple ? values : values[0]);
    });
  }

  function resolveFlowData(flows, values, onDone) {
    function resolve() {
      const loadingFlows = flows.filter(
        ([, flow]) => flow.status === "loading"
      );
      if (!loadingFlows.length) {
        let lastError;
        flows.forEach(([index, flow]) => {
          if (flow.status === "fail") {
            lastError = flow.error;
            return;
          }
          values[index] = flow.data;
        });
        return onDone(lastError);
      }
      // avoid to promise looping
      setTimeout(() => {
        Promise.all(loadingFlows).finally(resolve);
      });
    }
    resolve();
  }

  function resolveStateValues(props, values) {
    const state = getState();
    props.map(([index, prop]) => (values[index] = state[prop]));
  }

  function handleFlowChange() {
    stale = true;
    notifyChange();
  }

  function notifyChange() {
    promise = null;
    emitter.emit(CHANGE_EVENT, flow);
  }

  function handleChange(s, d, e, task) {
    if (task !== currentTask) {
      return;
    }
    error = e;
    data = d;
    status = s;
    notifyChange();
  }

  function getPromise() {
    if (promise) return promise;
    if (status === "fail") {
      promise = Promise.reject(error);
    } else if (status === "loading") {
      const p = new Promise((resolve, reject) => {
        const removeListener = emitter.on(CHANGE_EVENT, () => {
          removeListener();
          if (p === promise) {
            promise = null;
          }
          getPromise().then(resolve, reject);
        });
      });
      promise = p;
    } else {
      promise = Promise.resolve(data);
    }
    return promise;
  }

  function start(payload, inputTask) {
    if (!stale) return flow;
    const iterator = fn(payload);
    const task = createTask(
      undefined,
      (result) => {
        inputTask && inputTask.success(result);
        return handleChange("success", result, undefined, task);
      },
      (error) => {
        inputTask && inputTask.fail(error);
        return handleChange("fail", undefined, error, task);
      }
    );
    task.onCancel(() => {
      if (task !== currentTask) return;
      status = "cancelled";
      notifyChange();
    });
    dependencyProps.clear();
    dependencyFlows.clear();
    previousTask = currentTask;
    currentTask = task;
    stale = false;
    error = undefined;
    status = "loading";

    processFlow(iterator, undefined, commands, task);

    notifyChange();

    return flow;
  }

  function restart(payload, inputTask) {
    stale = true;
    start(payload, inputTask);
    return flow;
  }

  function watch(watcher) {
    return emitter.on(CHANGE_EVENT, watcher);
  }

  function dispose() {
    if (status === "disposed") return;
    status = "disposed";
    currentTask.dispose();
    emitter.dispose();
  }

  function cancel() {
    currentTask.cancel();
  }

  function handleStateChange(state) {
    let changed = false;
    dependencyProps.forEach((value, key) => {
      if (state[key] === value) return;
      changed = true;
    });
    if (changed) {
      stale = true;
      notifyChange();
    }
  }

  return flow;
}

export default createStore;
