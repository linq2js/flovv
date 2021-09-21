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

export function processFlow(
  iterator,
  payload,
  commands,
  ct,
  onSuccess,
  onError
) {
  const { value, done, error } = next(iterator, payload);
  if (error) {
    if (onError) return onError(error);
    throw error;
  }
  if (done) return onSuccess && onSuccess(value);

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
      const forkCt = createCt();
      processFlow(fork, undefined, commands, forkCt, undefined, (error) => {
        // A failure in an attached fork will cause the forking parent to abort
        if (ct.active) {
          ct.error = error;
        }
        if (onError) return onError(error);
        throw error;
      });
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

  if (value.all) {
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
    (error) => {
      if (!ct.active) return;
      ct.error = error;
      if (onError) return onError(error);
      throw error;
    }
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
  return promise.then(
    (result) => {
      if (!ct.active) return;
      return onSuccess(result);
    },
    (error) => {
      if (!ct.active) return;
      ct.error = error;
      if (onError) return onError(error);
      throw error;
    }
  );
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
  const emitter = createEmitter();
  const commands = {
    set(payload) {},
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
      f = createFlow(fn, getState);
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

function createCt() {}

function createFlow(fn, getState, commands) {
  let stale = true;
  let status = "pending";
  let token;
  let data;
  let error;
  const props = new Map();
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
          props.set(prop, state[prop]);
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
    let ct = createCt();
    let t = (token = {});
    props.clear();
    stale = false;
    error = undefined;
    status = "loading";

    processFlow(
      iterator,
      undefined,
      commands,
      ct,
      (r) => {
        isAsync = false;
        if (t !== token) return;
        handleChange("success", r, undefined);
      },
      (e) => {
        isAsync = false;
        if (t !== token) return;
        handleChange("fail", data, e);
      }
    );

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
    props.forEach((value, key) => {
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
    $$stateChange: handleStateChange,
    start,
    restart,
    watch,
  };
}

/**
 * store
 *  emit(event)
 *  on(event) => unsubscribe()
 *  state() // whole state
 *  flow(generator)
 *  watch()
 */
