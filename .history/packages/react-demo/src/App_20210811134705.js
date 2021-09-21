import flovv from "./flovv";
import { Provider, useFlow } from "./flovv/react";

const store = flovv({ state: { filter: "all" } });

function* LoadTodoList() {
  const todos = yield fetch("https://jsonplaceholder.typicode.com/todos").then(
    (res) => res.json()
  );
  return todos;
}

function TodoList() {}

function App() {
  return (
    <Provider store={store}>
      <Counter />
    </Provider>
  );
}

export default App;
