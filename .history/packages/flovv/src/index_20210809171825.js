function processFlow(
  value,
  payload,
  commands,
  ct,
  context,
  onSuccess,
  onError
) {
  if (
    value === null ||
    typeof value === "undefined" ||
    typeof value !== "object"
  ) {
    throw new Error("Invalid yield expression");
  }

  // is iterator
  if (typeof value.next === "function") {
    return processFlow(value, undefined, commands, ct, context, next, onError);
  }
}
