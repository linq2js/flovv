
import { FC } from "react";
import { Store, Flow,FlowGenerator, Status } from "./index";

export interface FlowRef<TPayload = any, TData = any> {
  readonly loading: boolean;
  readonly fail: boolean;
  readonly success: boolean;
  readonly data: TData;
  readonly error: any;
  readonly status: Status;
  start(payload?: TPayload): this;
  restart(payload?: TPayload): this;
  cancel(): this;
}

export function useStore(): Store;

export const Provider: FC<{ store: Store; children?: any }>;

export interface UseFlow {
  <TResult>(flow: string): FlowRef<unknown, TResult>;
  <TFlow>(flow: TFlow): InferFlowRef<TFlow>;
}

export type InferFlowRef<TFlow> =TFlow extends () => FlowGenerator

export const useFlow: UseFlow;