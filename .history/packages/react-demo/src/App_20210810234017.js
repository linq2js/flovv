import "./App.css";
import flovv from "./flovv";
import { Provider, useFlow } from "./flovv/react";

const store = flovv({
  state: {
    count: 2,
  },
});

function* Increase() {
  yield { set: { count: (x) => x + 1 } };
}

function* AsyncIncrease() {
  yield { delay: 1000 };
  yield { set: { count: (x) => x + 1 } };
}

function* AutoIncrease() {
  while (true) {
    yield { fork: AsyncIncrease() };
    yield { delay: 1500 };
  }
}

function* LoadPost() {
  yield { delay: 1000 };
  return yield fetch("https://jsonplaceholder.typicode.com/posts/1").then(
    (res) => res.json()
  );
}

const Counter = () => {
  const { data: count } = useFlow("@count").start();
  const increase = useFlow(Increase);
  const autoIncrease = useFlow(AutoIncrease);
  const { data, loading } = useFlow(LoadPost).start();

  return (
    <>
      <h1>{count}</h1>
      <button onClick={increase.restart}>Increase</button>
      <button onClick={autoIncrease.start}>Auto Increase</button>
      {increasing ? "Increasing..." : ""}
      <p />
      <xmp>{loading ? "Loading..." : JSON.stringify(data, null, 2)}</xmp>
    </>
  );
};

function App() {
  return (
    <Provider store={store}>
      <Counter />
    </Provider>
  );
}

export default App;
