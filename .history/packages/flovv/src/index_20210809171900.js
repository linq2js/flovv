function processFlow(expression, commands, ct, context, onSuccess, onError) {
  if (
    expression === null ||
    typeof expression === "undefined" ||
    typeof expression !== "object"
  ) {
    throw new Error("Invalid yield expression");
  }

  // is iterator
  if (typeof expression.next === "function") {
  }
}
