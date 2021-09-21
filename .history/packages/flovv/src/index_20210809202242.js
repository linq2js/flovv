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

export default function flovv({
  state: initialState = EMPTY_OBJECT,
} = EMPTY_OBJECT) {
  const flows = new Map();
  const watchers = [];
  let currentState = initialState;

  function handleStateChange() {
    flows.forEach((flow) => {
      flow.$$stateChange(currentState);
    });
    watchers.slice().forEach((watcher) => watcher(currentState));
  }

  function watch(watcher) {
    watchers.push(watcher);
    let active = true;
    return function () {
      if (!active) return;
      active = false;
      const index = watchers.indexOf(watcher);
      index !== -1 && watchers.splice(index, 1);
    };
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
    watch,
    flow,
  };
}

function createFlow(fn) {
  let stale = false;
  let status = "pending";

  function start() {}

  function restart() {
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
