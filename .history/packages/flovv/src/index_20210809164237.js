function processFlow(iterator, payload, commands, ct, onSuccess, onError) {
  const { done, value } = iterator.next(payload);
  if (done) {
    return onSuccess && onSuccess(value);
  }
}
