function processFlow(value, commands, ct, context, onSuccess, onError) {
  if (
    value === null ||
    typeof value === "undefined" ||
    typeof value !== "object"
  ) {
    throw new Error("Invalid yield expression");
  }

  // is iterator
  if (typeof value.next === "function") {
  }
}
