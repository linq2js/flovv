import { FC } from "react";
import { Store, FlowDefinition } from "./index";

export interface HookedFlow {}

export function useStore(): Store;

export const Provider: FC<{ store: Store; children?: any }>;

export function useFlow<TPayload, TResult>(
  definition: FlowDefinition<TPayload, TResult>
): HookedFlow<TPayload, TResult>;
