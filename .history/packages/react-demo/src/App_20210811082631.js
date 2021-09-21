import "./App.css";
import flovv from "./flovv";
import { Provider, useFlow } from "./flovv/react";

// create flow store
const store = flovv({ state: { count: 2 } });
// get count value flow
function* GetCount() {
  return yield { get: "count" };
}
// increase count flow
function* Increasement() {
  // using { set } expression to update specific state value
  yield { set: { count: (prev) => prev + 1 } };
}
const Counter = () => {};
function App() {
  return (
    <Provider store={store}>
      <Counter />
    </Provider>
  );
}

export default App;
