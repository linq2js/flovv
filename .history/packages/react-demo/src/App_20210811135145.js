import flovv from "./flovv";
import { Provider, useFlow } from "./flovv/react";

const store = flovv({ state: { filter: "all" } });

function* TodoList() {
  const todos = yield fetch("https://jsonplaceholder.typicode.com/todos").then(
    (res) => res.json()
  );
  return todos;
}

function* FilteredTodoList() {
  const filter = yield { ref: "filter" };
  const todos = yield { ref: TodoList };
  if (filter === "completed") return todos.filter((x) => x.completed);
  if (filter === "active") return todos.filter((x) => !x.completed);
  return todos;
}

function* UpdateFilter(filter) {
  yield { set: { filter } };
}

function TodoApp() {
  const filter = useFlow("filter").start().data;
  const updateFilter = useFlow(UpdateFilter).restart;
  const { data, loading } = useFlow(FilteredTodoList).start();
  if (loading) return "Loading...";
  return (
    <>
      <p>
        <label onClick={() => updateFilter("all")}>
          <input type="checkbox" defaultChecked={filter === "all"} /> All
        </label>
      </p>
    </>
  );
}

function App() {
  return (
    <Provider store={store}>
      <TodoApp />
    </Provider>
  );
}

export default App;
