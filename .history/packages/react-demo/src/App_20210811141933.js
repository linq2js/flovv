import flovv from "./flovv";
import { Provider, useFlow } from "./flovv/react";

const store = flovv({ state: { filter: "all" } });

function* TodoList() {
  const todos = yield fetch("https://jsonplaceholder.typicode.com/todos").then(
    (res) => res.json()
  );
  return todos.slice(0, 20);
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

function* RemoveTodo(id) {
  // call api to remove todo
  // perform optimistic update
  yield { set: [TodoList, (todos) => todos.filter((x) => x.id !== id)] };
}

function TodoApp() {
  const todoList = useFlow(TodoList);
  const filter = useFlow("filter").start().data;
  const updateFilter = useFlow(UpdateFilter).restart;
  const removeTodo = useFlow(RemoveTodo).restart;
  const { data, loading } = useFlow(FilteredTodoList).start();
  if (loading) return "Loading...";

  return (
    <>
      <button onClick={() => todoList.restart()}>Reload</button>
      <p>
        <label onClick={() => updateFilter("all")}>
          <input key={filter} type="radio" defaultChecked={filter === "all"} />{" "}
          All
        </label>
        <label onClick={() => updateFilter("active")}>
          <input
            key={filter}
            type="radio"
            defaultChecked={filter === "active"}
          />{" "}
          Active
        </label>
        <label onClick={() => updateFilter("completed")}>
          <input
            key={filter}
            type="radio"
            defaultChecked={filter === "completed"}
          />{" "}
          Completed
        </label>
      </p>
      <ul>
        {data.map((todo) => (
          <li
            key={todo.id}
            onClick={() => removeTodo(todo.id)}
            style={{ opacity: todo.completed ? 0.5 : 1 }}
          >
            {todo.title}
          </li>
        ))}
      </ul>
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
