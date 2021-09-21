import { FC } from "react";
import { Store, Flow, Status } from "./index";

export interface HookedFlow<TPayload, TData> {
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

export function useFlow<TPayload, TResult>(
  definition: Flow<TPayload, TResult>
): HookedFlow<TPayload, TResult>;
