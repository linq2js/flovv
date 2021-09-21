import "./App.css";
import flovv from "flovv";
import { Provider, useFlow } from "flovv/react";

const store = flovv({
  state: {
    count: 1,
  },
});

const Counter = () => {
  console.log(1);
  const { data: count } = useFlow("@count").start();

  return (
    <>
      <h1>{count}</h1>
      <button>Increase</button>
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
