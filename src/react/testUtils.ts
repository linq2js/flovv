import * as React from "react";

import { createController, FlowController } from "../lib";
import { FlowProvider, FlowProviderProps } from "./index";

export function createWrapper(
  props?: Partial<FlowProviderProps>
): [React.FC<{}>, FlowController] {
  const controller = createController();
  return [
    ({ children }) => {
      return React.createElement(
        FlowProvider,
        { controller, ...props },
        children
      );
    },
    controller,
  ];
}
