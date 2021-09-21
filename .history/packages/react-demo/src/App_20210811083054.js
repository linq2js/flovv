import "./App.css";
import flovv from "./flovv";
import { Provider, useFlow } from "./flovv/react";

// create flovv store with initial state
const store = flovv({ state: { count: 2 } });
// get count value flow
function* GetCount() {
  return yield { get: "@count" };
}
// increase count flow
function* Increment() {
  // using { set } expression to update specific state value
  yield { set: { count: (prev) => prev + 1 } };
}
const Counter = () => {
  // start GetCount flow and retrieve flow object
  // destructure flow object to get flow data
  const { data: count } = useFlow(GetCount).start();
  // retrieve flow object
  const increment = useFlow(Increment);

  return (
    <>
      <h1>{count}</h1>
      {/* should call restart() because if we call start() the Increment flow will be executed once */}
      <button onClick={() => increment.restart()}></button>
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
