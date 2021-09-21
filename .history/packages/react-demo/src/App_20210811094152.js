import flovv from "./flovv";
import { Provider, useFlow } from "./flovv/react";

const store = flovv();

function* LoadUserList() {}

function UserList() {
  const { data, loading } = useFlow(LoadUserList).start();
  if (loading) return "Loading...";
  return (
    <ul>
      {data.map((user) => (
        <li>
          ({user.id}) {user.name}
        </li>
      ))}
    </ul>
  );
}

function App() {
  return (
    <Provider store={store}>
      <Counter />
    </Provider>
  );
}

export default App;
