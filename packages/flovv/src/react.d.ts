/* eslint-disable @typescript-eslint/ban-types */

/* eslint-disable @typescript-eslint/no-explicit-any */
import { Store, Flow, Status } from "./index";
import { FC } from "react";

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

export const Provider: FC<{
  store: Store;
  suspense?: boolean;
  errorBoundary?: boolean;
  children?: any;
}>;

export interface UseFlow {
  <TResult = any>(flow: string): TResult;
  <TPayload, TResult>(
    flow: Flow<TPayload, TResult>,
    payload?: TPayload
  ): FlowRef<TPayload, TResult>;
}

export const useFlow: UseFlow;
