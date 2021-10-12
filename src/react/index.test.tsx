import * as React from "react";

import { act, render } from "@testing-library/react";

import { delay } from "../lib";
import { createWrapper } from "./testUtils";

test("controller ready", async () => {
  function* initFlow() {
    yield delay(10);
  }

  const [Wrapper] = createWrapper(
    { fallback: <div data-testid="loading" /> },
    { initFlow }
  );
  const { getByTestId } = render(
    <Wrapper>
      <div data-testid="ok" />
    </Wrapper>
  );
  getByTestId("loading");
  await act(() => delay(15));
  getByTestId("ok");
});
