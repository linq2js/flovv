const EMPTY_OBJECT = {};
const EMPTY_ARRAY = [];
const NOOP = () => {};

function processNext(iterator, payload) {
  try {
    return iterator.next(payload);
  } catch (error) {
    return { error };
  }
}

export function processFlow(iterator, payload, commands, task) {
  const { value, done, error } = processNext(iterator, payload);
  if (error) return task.handleError(error);
  if (done) return task.handleSuccess(value);

  if (!value || typeof value !== "object") {
    throw new Error("Expression must be object type");
  }

  function next(result) {
    return processFlow(iterator, result, commands, task);
  }

  // is iterator
  if (typeof value.next === "function") {
    return processFlow(value, undefined, commands, createTask(task, next));
  }

  // is promise
  if (typeof value.then === "function") {
    return task.wrap(value, next);
  }

  if (value.fork) {
    const isMultipleFork = Array.isArray(value.fork);
    const forks = isMultipleFork ? value.fork : [value.fork];
    const childTasks = forks.map((forkedIterator) => {
      // cancel forked flow
      const forkedTask = createTask(task);
      processFlow(forkedIterator, undefined, commands, forkedTask);
      return forkedTask;
    });

    return next(isMultipleFork ? childTasks : childTasks[0]);
  }

  if (value.all || value.done || value.any) {
    return waitFor(
      value.all ? "all" : value.done ? "done" : "any",
      value.all || value.done || value.any,
      task,
      next
    );
  }

  const keys = Object.keys(value);

  if (keys.length !== 1 || !(keys[0] in commands)) {
    throw new Error(
      `Expect { ${Object.keys(commands).join(
        "|"
      )}: payload } but got {${keys.join(",")}}`
    );
  }

  const key = keys[0];

  return commands[key](value[key], createTask(task, next), commands);
}

function waitFor(mode, target, task, onSuccess) {
  const results = Array.isArray(target) ? [] : {};
  const entries = Object.entries(target);
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

  return { emit, on };
}

export default function flovv({
  state: initialState = EMPTY_OBJECT,
  commands: customCommands,
} = EMPTY_OBJECT) {
  const flows = new Map();
  const tokens = {};
  const emitter = createEmitter();
  const commands = {
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
        if (onError) return onError(error);
        throw error;
      } finally {
        if (nextState !== currentState) {
          currentState = nextState;
          handleChange();
        }
        if (!error && promises.length) {
          Promise.all(promises).then(task.handleSuccess);
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
        const childTask = createTask(task);
      });
    },
    when(payload, task) {
      const events =
        typeof payload === "string"
          ? [[payload, undefined]]
          : Array.isArray(payload)
          ? payload.map((x) => [x, undefined])
          : Object.entries(payload);
      const removeDisposeListeners = events.map(([event, check]) =>
        task.onDispose(
          emitter.on(event, (e) => {
            if (typeof check === "function" && !check(e)) return;
            removeDisposeListeners.forEach((removeDisposeListener) => {
              const removeEventListener = removeDisposeListener();
              typeof removeEventListener === "function" &&
                removeEventListener();
            });
            task.handleSuccess(e);
          })
        )
      );
    },
    ...customCommands,
  };
  let currentState = initialState;

  function getState() {
    return currentState;
  }

  function handleChange() {
    flows.forEach((flow) => {
      flow.$$stateChange(currentState);
    });
    emitter.emit("#change", currentState);
  }

  function watch(watcher) {
    return emitter.on("#change", watcher);
  }

  function flow(fn) {
    let f = flows.get(fn);
    if (!f) {
      f = createFlow(fn, getState, commands);
      flows.set(fn, f);
    }
    return f;
  }

  return {
    get: getState,
    watch,
    flow,
  };
}

function createTask(parent, onSuccess, onError) {
  let cancelled = false;
  let disposed = false;
  let done = false;
  const emitter = createEmitter();

  const task = {
    get cancelled() {
      return cancelled || (parent && parent.cancelled);
    },
    cancel() {
      if (cancelled) return;
      cancelled = true;
      emitter.emit("cancel");
      task.dispose();
    },
    dispose() {
      if (done || disposed) return;
      disposed = true;
      emitter.emit("dispose");
    },
    onDispose(listener) {
      if (done || disposed) return NOOP;
      return emitter.on("dispose", listener);
    },
    onCancel(listener) {
      if (done || disposed) return NOOP;
      if (cancelled) {
        try {
          listener();
        } finally {
          return NOOP;
        }
      }
      return emitter.on("cancel", listener);
    },
    handleSuccess(result) {
      if (isCancelled()) return;
      if (done || disposed) return;
      done = true;
      return onSuccess && onSuccess(result);
    },
    handleError(error) {
      if (isCancelled()) return;
      if (done || disposed) return;
      done = true;
      if (onError) return onError(error);
      if (parent) return parent.onError(error);
      throw error;
    },
    wrap(promise, onSuccess, onError) {
      const childTask = createTask(task, onSuccess, onError);
      if (typeof promise.cancel === "function") {
        childTask.onCancel(() => promise.cancel());
      }
      if (typeof promise.dispose === "function") {
        childTask.onDispose(() => promise.dispose());
      }
      return Object.assign(
        promise.then(childTask.handleSuccess).catch(childTask.handleError),
        {
          cancel: childTask.cancel,
          dispose: childTask.dispose,
        }
      );
    },
  };

  return task;
}

function createFlow(fn, getState, commands) {
  let stale = true;
  let status = "pending";
  let currentTask = createTask();
  let data;
  let error;
  const dependencyProps = new Map();
  const emitter = createEmitter();

  commands = {
    ...commands,
    get(payload) {
      const state = getState();
      const isMultipleStates = Array.isArray(payload);
      const propArray = isMultipleStates ? payload : [payload];
      const values = propArray.map((prop) => {
        // get value and track the prop
        if (prop[0] === "@") {
          prop = prop.substr(1);
          dependencyProps.set(prop, state[prop]);
        }
        return stale[prop];
      });
      return isMultipleStates ? values : values[0];
    },
  };

  function handleChange(s, d, e) {
    error = e;
    data = d;
    status = s;
    emitter.emit("change");
  }

  function start(payload) {
    if (!stale) return;
    const iterator = fn(payload);
    let isAsync = true;
    const task = createTask(
      undefined,
      (result) => handleChange("success", result),
      (error) => handleChange("fail", undefined, error)
    );
    dependencyProps.clear();
    currentTask = task;
    stale = false;
    error = undefined;
    status = "loading";

    processFlow(iterator, undefined, commands, task);

    if (isAsync) {
      // notify
      emitter.emit("change");
    }
  }

  function restart(payload) {
    stale = true;
    return start(payload);
  }

  function watch(watcher) {
    return emitter.on("change", watcher);
  }

  function handleStateChange(state) {
    let changed = false;
    dependencyProps.forEach((value, key) => {
      if (state[key] === value) return;
      changed = true;
    });
    if (changed) {
      stale = true;
      emitter.emit("change");
    }
  }

  return {
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
    cancel: currentTask.cancel,
    $$stateChange: handleStateChange,
    start,
    restart,
    watch,
  };
}
