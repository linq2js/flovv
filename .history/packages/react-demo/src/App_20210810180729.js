import logo from "./logo.svg";
import "./App.css";
import flovv from "flovv";
import { Provider, useFlow } from "flovv/react";

const Counter = () => {
  const count = useFlow("@count");
};

function App() {
  return <Provider></Provider>;
}

export default App;
