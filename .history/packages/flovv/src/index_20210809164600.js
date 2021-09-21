function processFlow(
  iterator,
  payload,
  commands,
  ct,
  context,
  onSuccess,
  onError
) {
  const { done, value } = iterator.next(payload);
  if (done) {
    return onSuccess && onSuccess(value);
  }
  if (value === null || typeof value === "undefined") {
    throw new Error("Invalid yield expression");
  }
}
