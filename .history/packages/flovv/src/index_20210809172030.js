function processExpression(
  expression,
  payload,
  commands,
  ct,
  context,
  onSuccess,
  onError
) {
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
}
