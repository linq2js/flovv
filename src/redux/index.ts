import { AnyAction, Store } from "redux";

import { createEffect, EffectContext } from "../lib";

export function select<TState = any, TResult = any>(
  selector: (state: TState) => TResult
) {
  return createStoreEffect<TState>((store, ec) => {
    ec.next(selector(store.getState()));
  });
}

export function dispatch(action: AnyAction) {
  return createStoreEffect((store, ec) => {
    ec.next(store.dispatch(action));
  });
}

export function createStoreEffect<TState = any>(
  effect: (store: Store<TState>, ec: EffectContext) => void
) {
  return createEffect((ec) => {
    const store: Store<TState> = ec.context.store;
    if (!store) {
      throw new Error("No Redux store found");
    }
    return effect(store, ec);
  });
}
