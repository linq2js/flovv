const EMPTY_OBJECT = {};
// const EMPTY_ARRAY = [];
const NOOP = () => {};
const CHANGE_EVENT = "#change";
const READY_EVENT = "#ready";
const FAIL_EVENT = "#fail";

function processNext(iterator, payload) {
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
    return task.handleError(error);
  }
  if (done) {
    return task.handleSuccess(value);
  }

  if (!value || typeof value !== "object") {
    throw new Error("Expression must be object type");
  }
  const next = (result) => processFlow(iterator, result, commands, task);
  return processExpression(value, task, commands, next);
}

function processFork(fork, commands, task, next) {
  // fork expression
  if (
    !Array.isArray(fork) &&
    typeof fork === "object" &&
    typeof fork.next !== "function"
  ) {
    const forkedTask = createTask(undefined, undefined, task.handleError);
    processExpression(fork, forkedTask, commands, forkedTask.handleSuccess);
    return next(forkedTask);
  }

  // fork iterators
  const isMultipleFork = typeof fork.next !== "function";
  const forks = isMultipleFork ? Object.entries(fork) : [[0, fork]];
  const childTasks = isMultipleFork ? (Array.isArray(fork) ? [] : {}) : {};
  forks.forEach(([key, forkedIterator]) => {
    // cancel forked flow
    const forkedTask = createTask(undefined, undefined, task.handleError);
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
  const commandResult = commands[key](expression[key], childTask, commands);
  // command can produce yield expression
  if (typeof commandResult === "function") {
    const exp = commandResult();
    if (!exp) return next();
    return processExpression(exp, task, commands, next);
  }
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
      return task.handleError(error);
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
    processExpression(expression, childTask, commands, childTask.handleSuccess);
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
  commands: customCommands,
} = EMPTY_OBJECT) {
  const flows = new Map();
  const tokens = {};
  const emitter = createEmitter();
  const executedFlows = new WeakSet();
  const commands = {
    ...customCommands,
    $$flow: flow,
    start(payload, task) {
      const [fn, p] = Array.isArray(payload) ? payload : [payload];
      return flow(fn).start(p, task);
    },
    restart(payload, task) {
      const [fn, p] = Array.isArray(payload) ? payload : [payload];
      return flow(fn).restart(p, task);
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

        task.handleSuccess();
      }
      next();
    },
    set(payload, task) {
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
        return task.handleError(e);
      } finally {
        if (nextState !== currentState) {
          currentState = nextState;
          handleChange();
        }
        if (!error && promises.length) {
          Promise.all(promises)
            .then(task.handleSuccess)
            .catch(task.handleError);
        } else {
          task.handleSuccess();
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
    on(payload, task) {
      const entries = Object.entries(payload);
      const results = {};
      entries.forEach((event, listener) => {
        const childTask = task.child();
        childTask.onDispose(emitter.on(event, listener));
        results[event] = childTask;
        // dispose child task once parent task disposed
        task.onDispose(childTask.dispose);
      });
      task.handleSuccess(results);
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
            task.handleSuccess(e);
          });
        }
        // when: flow => watch flow state
        if (typeof target === "function") {
          const f = flow(target);
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
              task.handleSuccess(f);
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

  function handleChange() {
    flows.forEach((flow) => {
      flow.$$stateChange(currentState);
    });
    emitter.emit(CHANGE_EVENT, currentState);
  }

  function watch(watcher) {
    return emitter.on(CHANGE_EVENT, watcher);
  }

  function flow(fn) {
    if (typeof fn === "string") {
      const cacheKey = fn.replace(/\s+/g, "");
      let cachedFn = fnCache.get(cacheKey);
      if (!cachedFn) {
        const states = cacheKey.split(",");
        if (states.length === 1) {
          const state = states[0];
          cachedFn = function* () {
            return yield { get: state };
          };
        } else {
          cachedFn = function* () {
            return yield { get: states };
          };
        }
        fnCache.set(cacheKey, cachedFn);
      }
      fn = cachedFn;
    }

    let f = flows.get(fn);
    if (!f) {
      f = createFlow(fn, getState, commands);
      flows.set(fn, f);
    }
    return f;
  }

  function start(fn, payload) {
    return flow(fn).start(payload).data;
  }

  function restart(fn, payload) {
    return flow(fn).restart(payload).data;
  }

  if (typeof init === "function") {
    commands.once(
      init,
      createTask(
        undefined,
        () => emitter.emit(READY_EVENT),
        () => emitter.emit(FAIL_EVENT)
      )
    );
  }

  return {
    get state() {
      return getState();
    },
    on: emitter.on,
    emit: emitter.emit,
    watch,
    flow,
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
    handleSuccess(value) {
      if (status || disposed || task.cancelled) return;
      status = "success";
      result = value;
      return onSuccess && onSuccess(value);
    },
    handleError(value) {
      if (status || disposed || task.cancelled) return;
      status = "fail";
      error = value;
      if (onError) return onError(value);
      if (parent) return parent.handleError(value);
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
            return task.handleError(error);
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

export function createFlow(fn, getState, commands) {
  let stale = true;
  let status = "pending";
  let currentTask = createTask();
  let data;
  let error;
  let promise;
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
    start,
    restart,
    watch,
    dispose,
  };

  commands = {
    ...commands,
    get(payload, task) {
      const state = getState();
      const isMultipleStates = Array.isArray(payload);
      const propArray = isMultipleStates ? payload : [payload];
      const values = propArray.map((prop) => {
        // get value and track the prop
        if (prop[0] === "@") {
          prop = prop.substr(1);
          dependencyProps.set(prop, state[prop]);
        }
        return state[prop];
      });
      return task.handleSuccess(isMultipleStates ? values : values[0]);
    },
  };

  function notifyChange() {
    promise = null;
    emitter.emit(CHANGE_EVENT, flow);
  }

  function handleChange(s, d, e, task) {
    if (task !== currentTask) return;
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
      const p = (promise = new Promise((resolve, reject) => {
        const removeListener = emitter.on(CHANGE_EVENT, () => {
          removeListener();
          if (p === promise) {
            promise = null;
          }
          getPromise().then(resolve, reject);
        });
      }));
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
        inputTask && inputTask.handleSuccess(result);
        return handleChange("success", result, undefined, task);
      },
      (error) => {
        inputTask && inputTask.handleError(error);
        return handleChange("fail", undefined, error, task);
      }
    );
    task.onCancel(() => {
      if (task !== currentTask) return;
      status = "cancelled";
      notifyChange();
    });
    dependencyProps.clear();
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
