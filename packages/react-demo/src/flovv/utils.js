export const delay = (ms, value) => {
  let timer;
  return Object.assign(
    new Promise((resolve) => setTimeout(resolve, ms, value)),
    {
      cancel() {
        clearTimeout(timer);
      },
    }
  );
};
