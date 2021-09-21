function processExpression(
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
    const { value, done } = value.next(payload);
    if (done) return onSuccess && onSuccess(value);
    // next
    return processFlow(value, value, commands, ct, context, onSuccess, onError);
  }

  // is promise
  if (typeof value.then === "function") {
    return value.then(
      (result) => {},
      (error) => {
        if (ct.cancelled) return;
        if (onError) return onError(error);
        throw error;
      }
    );
  }
}
