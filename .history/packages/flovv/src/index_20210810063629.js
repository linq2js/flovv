const EMPTY_OBJECT = {};
const EMPTY_ARRAY = [];
const NOOP = () => {};

function next(iterator, payload) {
  try {
    return iterator.next(payload);
  } catch (error) {
    return { error };
  }
}

export function processFlow(iterator, payload, commands, task) {
  const { value, done, error } = next(iterator, payload);
  if (error) return task.handleError(error);
  if (done) return task.handleSuccess(value);

  if (!value || typeof value !== "object") {
    throw new Error("Expression must be object type");
  }

  // is iterator
  if (typeof value.next === "function") {
    return processFlow(
      value,
      undefined,
      commands,
      ct,
      (result) =>
        processFlow(iterator, result, commands, ct, onSuccess, onError),
      onError
    );
  }

  // is promise
  if (typeof value.then === "function") {
    return processPromise(
      value,
      ct,
      (result) =>
        processFlow(iterator, result, commands, ct, onSuccess, onError),
      onError
    );
  }

  if (value.fork) {
    const isArray = Array.isArray(value.fork);
    const forks = isArray ? value.fork : [value.fork];
    const cts = forks.map((fork) => {
      // cancel forked flow
      const forkCt = createCancellationToken();
      processFlow(fork, undefined, commands, forkCt);
      return forkCt;
    });

    return processFlow(
      iterator,
      isArray ? cts : cts[0],
      commands,
      ct,
      onSuccess,
      onError
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

  return commands[key](
    value[key],
    commands,
    ct,
    (result) => {
      if (!ct.active) return;
      return processFlow(iterator, result, commands, ct, onSuccess, onError);
    },
    errorHandler(ct, onError)
  );
}

function errorHandler(ct, onError) {
  return function (error) {
    if (!ct.active) return;
    ct.error = error;
    if (onError) return onError(error);
    throw error;
  };
}

function processPromise(promise, ct, onSuccess, onError) {
  return promise
    .then((result) => {
      if (!ct.active) return;
      return onSuccess(result);
    })
    .catch(errorHandler(ct, onError));
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
    set(payload, c, ct, onSuccess, onError) {
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
              new Promise((resolve, reject) => {
                value
                  .then((result) => {
                    if (
                      !ct.active ||
                      changeTokens[prop] !== tokens[prop] ||
                      currentState[prop] === result
                    )
                      return;
                    currentState = { ...currentState, [prop]: result };
                    handleChange();
                    resolve();
                  })
                  .catch(reject);
              })
            );
          } else if (value !== currentState[prop]) {
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
          Promise.all(promises)
            .then(onSuccess)
            .catch(errorHandler(ct, onError));
        }
      }
    },
    emit(payload) {},
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
      if (disposed) return;
      disposed = true;
      emitter.emit("dispose");
    },
    onDispose(listener) {
      return emitter.on("dispose", listener);
    },
    onCancel(listener) {
      return emitter.on("cancel", listener);
    },
    handleSuccess(result) {
      if (isCancelled()) return;
      return onSuccess && onSuccess(result);
    },
    handleError(error) {
      if (isCancelled()) return;
      if (onError) return onError(error);
      if (parent) return parent.onError(error);
      throw error;
    },
  };

  if (parent && typeof parent.then === "function") {
    const promise = parent;
    parent = undefined;

    if (typeof promise.cancel === "function") {
      task.onCancel(() => promise.cancel());
    }
    if (typeof promise.dispose === "function") {
      task.onDispose(() => promise.dispose());
    }
    return Object.assign(
      promise.then(task.handleSuccess).catch(task.handleError),
      {
        cancel: task.cancel,
        dispose: task.dispose,
      }
    );
  }

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
      const isArray = Array.isArray(payload);
      const propArray = isArray ? payload : [payload];
      const values = propArray.map((prop) => {
        // get value and track the prop
        if (prop[0] === "@") {
          prop = prop.substr(1);
          dependencyProps.set(prop, state[prop]);
        }
        return stale[prop];
      });
      return isArray ? values : values[0];
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
