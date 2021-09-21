const EMPTY_OBJECT = {};
const EMPTY_ARRAY = [];
const NOOP = () => {};

export function processFlow(
  iterator,
  payload,
  commands,
  ct,
  context,
  onSuccess,
  onError
) {
  const { value, done } = iterator.next(payload);
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
      context,
      (result) =>
        processFlow(
          iterator,
          result,
          commands,
          ct,
          context,
          onSuccess,
          onError
        ),
      onError
    );
  }

  // is promise
  if (typeof value.then === "function") {
    return processPromise(
      value,
      ct,
      (result) =>
        processFlow(
          iterator,
          result,
          commands,
          ct,
          context,
          onSuccess,
          onError
        ),
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

  return commands[keys[0]](value[keys[0]], context, {
    fork: (iterator, ct, newContext, onSuccess, onError) =>
      processFlow(
        iterator,
        undefined,
        commands,
        ct,
        newContext || context,
        onSuccess,
        onError
      ),
    onSuccess: (result) => {
      if (ct.cancelled) return;
      return processFlow(
        iterator,
        result,
        commands,
        ct,
        context,
        onSuccess,
        onError
      );
    },
    onError: (error) => {
      if (ct.cancelled) return;
      if (onError) return onError(error);
      throw error;
    },
  });
}

function processPromise(promise, ct, onSuccess, onError) {
  return promise.then(
    (result) => {
      if (ct.cancelled) return;
      return onSuccess(result);
    },
    (error) => {
      if (ct.cancelled) return;
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
} = EMPTY_OBJECT) {
  const flows = new Map();
  const emitter = createEmitter();
  let currentState = initialState;

  function handleStateChange() {
    flows.forEach((flow) => {
      flow.$$stateChange(currentState);
    });
    emitter.emit("#change", currentState);
  }

  function flow(fn) {
    let f = flows.get(fn);
    if (!f) {
      f = createFlow(fn);
      flows.set(fn, f);
    }
    return f;
  }

  return {
    watch: (watcher) => emitter.on("#change", watcher),
    flow,
  };
}

function createCt() {}

function createFlow(fn, commands, context) {
  let stale = true;
  let status = "pending";
  let token;
  let data;
  let error;

  function start(payload) {
    if (!stale) return;
    const iterator = fn(payload);
    let isAsync = true;
    let ct = createCt();
    let t = (token = {});

    error = undefined;
    status = "loading";

    processFlow(
      iterator,
      undefined,
      commands,
      ct,
      context,
      (r) => {
        isAsync = false;
        if (t !== token) return;
        data = r;
      },
      (e) => {
        isAsync = false;
        if (t !== token) return;
        error = e;
      }
    );

    if (isAsync) {
      // notify
    }
  }

  function restart(payload) {
    stale = true;
    return start();
  }

  function handleStateChange() {}

  return {
    $$stateChange: handleStateChange,
    start,
    restart,
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
