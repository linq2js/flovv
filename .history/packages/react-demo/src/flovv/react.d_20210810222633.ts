import { FC } from "react";
import { Store, FlowDefinition } from "./index";

export function useStore(): Store;

export const Provider: FC<{ store: Store; children?: any }>;

export function useFlow(definition: FlowDefinition): FlowHook;
