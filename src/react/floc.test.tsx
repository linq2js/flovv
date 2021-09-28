import * as React from "react";

import { act, render, fireEvent } from "@testing-library/react";

import { floc } from ".";
import { delay, start } from "../lib";
import { createWrapper } from "./testUtils";

test("async loading", async () => {
  const [wrapper] = createWrapper();
  function* fetchData() {
    yield delay(10);
    return 1;
  }

  const Component = floc(function* () {
    const result: number = yield start(fetchData);
    return <div data-testid="result">{result}</div>;
  });

  const { getByTestId } = render(<Component />, { wrapper });

  expect(() => getByTestId("result")).toThrowError();
  await act(() => delay(15));
  expect(getByTestId("result").innerHTML).toBe("1");
});

test("hooks", async () => {
  const [wrapper] = createWrapper();

  const Component = floc(function* () {
    const [count, setCount] = React.useState(0);

    return (
      <div data-testid="result" onClick={() => setCount(count + 1)}>
        {count}
      </div>
    );
  });

  const { getByTestId } = render(<Component />, { wrapper });
  const $result = getByTestId("result");

  expect($result.innerHTML).toBe("0");
  fireEvent.click($result);
  expect($result.innerHTML).toBe("1");
  fireEvent.click($result);
  expect($result.innerHTML).toBe("2");
});
