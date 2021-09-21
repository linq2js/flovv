import { FC } from "react";
import { Store, Flow, FlowGenerator, Status, YieldExpression } from "./index";

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
  <TResult = any>(flow: string): FlowRef<unknown, TResult>;
  <TResult>(
    flow: () => Generator<YieldExpression | YieldExpression[], TResult>
  ): FlowRef<any, TResult>;
}

export const useFlow: UseFlow;
