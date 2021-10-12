import * as React from "react";

import { createController, FlowController, ControllerOptions } from "../lib";
import { FlowProvider, FlowProviderProps } from "./index";

export function createWrapper(
  props?: Partial<FlowProviderProps>,
  options?: Partial<ControllerOptions>
): [React.FC<{}>, FlowController] {
  const controller = createController(options);
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
