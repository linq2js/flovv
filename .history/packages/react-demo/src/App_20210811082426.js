import "./App.css";
import flovv from "./flovv";
import { Provider, useFlow } from "./flovv/react";

const store = flovv({ state: { count: 2 } });

function App() {
  return (
    <Provider store={store}>
      <Counter />
    </Provider>
  );
}

export default App;
