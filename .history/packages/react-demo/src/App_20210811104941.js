import flovv from "./flovv";
import { Provider, useFlow } from "./flovv/react";

// create flovv store with initial state
const store = flovv({ state: { count: 1 } });
// get count value flow
function* GetCount() {
  // if we want to read count value, just call { get: "count" }
  // using { ref: "count" } means the GetCount flow will be stale whenever count value changed
  return yield { ref: "count" };
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
      <button onClick={() => increment.restart()}>Increment</button>
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
