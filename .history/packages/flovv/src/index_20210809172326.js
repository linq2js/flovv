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
  if (
    expression === null ||
    typeof expression === "undefined" ||
    typeof expression !== "object"
  ) {
    throw new Error("Invalid expression");
  }

  // is iterator
  if (typeof expression.next === "function") {
    const { value, done } = expression.next(payload);
    if (done) return onSuccess && onSuccess(value);
    // next
    return processFlow(
      expression,
      value,
      commands,
      ct,
      context,
      onSuccess,
      onError
    );
  }

  // is promise
  if (typeof expression.then === "function") {
    return expression.then(
      (result) => {},
      (error) => {
        if (ct.cancelled) return;
        if (onError) return onError(error);
        throw error;
      }
    );
  }
}
