function processFlow(
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

  if (
    value === null ||
    typeof value === "undefined" ||
    typeof value !== "object"
  ) {
    throw new Error("Invalid expression");
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
    return value.then(
      (result) => {
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
      (error) => {
        if (ct.cancelled) return;
        if (onError) return onError(error);
        throw error;
      }
    );
  }

  const keys = Object.keys(value);
  if (keys.length !== 1) {
    throw new Error("Invalid expression");
  }
}
