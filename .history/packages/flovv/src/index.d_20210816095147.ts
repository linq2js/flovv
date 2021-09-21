/* eslint-disable @typescript-eslint/ban-types */
/* eslint-disable @typescript-eslint/no-explicit-any */

export type Flow<
  TPayload = any,
  TResult = void,
  TCommands = { [key: string]: any }
> =
  | ((payload: TPayload) => FlowGenerator<TResult, TCommands>)
  | (() => FlowGenerator<TResult, TCommands>);

export type FlowGenerator<TResult = any, TCommands = {}> = Generator<
  YieldExpression<TCommands> | YieldExpression<TCommands>[],
  TResult,
  any
>;

export type Callback<T = any> = (arg?: T) => void;

export type YieldExpression<TCommands = { [key: string]: any }> =
  | FlowGenerator<TCommands>
  | Promise<any>
  | ({
      on?: { [event: string]: Flow | [Flow, any] | YieldExpression };
      emit?: string | string[] | { [event: string]: any };
      when?:
        | string
        | string[]
        | { [event: string]: (payload?: any) => boolean }
        | Flow;

      all?: { [key: string]: YieldExpression } | YieldExpression[];
      done?: { [key: string]: YieldExpression } | YieldExpression[];
      any?: { [key: string]: YieldExpression } | YieldExpression[];

      ref?: any;
      get?: any;
      set?:
        | // { state1: value1, state2: value2 }
        { [state: string]: ((prev: any) => any) | any }
        // [flow, value]
        | [Flow | string, any]
        // reducer
        | ((state: any) => any);
      select?: ((state: any) => any) | ((state: any) => any)[];
      context?: string | string[] | { [key: string]: any };

      start?: Flow | [Flow<TPayload>, TPayload];
      restart?: Flow | [Flow<TPayload>, TPayload];

      fork?: FlowGenerator | FlowGenerator[] | YieldExpression;
      call?: Function | [Function, ...any[]];
      cancel?: boolean | Flow | null | undefined | string | [Flow, ...any[]];
      remove?: Flow | [Flow, ...any[]];

      once?: Flow | Flow[];
      use?: CommandCollection | CommandCollection[];

      throttle?: {
        ms: number;
        when: WhenExpression["when"];
        flow: Flow<TPayload>;
        payload?: TPayload;
      };
      debounce?: {
        ms: number;
        when: WhenExpression["when"];
        flow: Flow<TPayload>;
        payload?: TPayload;
      };
      delay?: number;
    } & TCommands);

export interface Store<TState = { [key: string]: any }> {
  readonly state: TState;
  readonly status: Status;
  readonly error: Error;
  watch(watcher: Callback<TState>);
  emit(event: string, payload?: any): void;
  on(event: string, listener: Callback): void;
  flow<TPayload, TResult>(
    definition: Flow<TPayload, TResult>
  ): FlowInstance<TPayload, TResult>;
  start<TPayload, TResult>(
    definition: Flow<TPayload, TResult>,
    payload?: TPayload
  ): TResult;
  restart<TPayload, TResult>(
    definition: Flow<TPayload, TResult>,
    payload?: TPayload
  ): TResult;
  ready(listener: Function): Function;
  run<TPayload, TResult>(
    flow: Flow<TPayload, TResult>,
    options?: RunOptions<TPayload, TResult>
  ): Task<TResult>;
}

export interface RunOptions<TPayload, TResult> {
  payload?: TPayload;
  onSuccess?: (result?: TResult) => void;
  onError?: (error?: Error) => void;
  commands?: CommandCollection;
}

export type Status = undefined | "loading" | "success" | "fail";

export interface FlowInstance<TPayload, TData> extends Promise<TData> {
  readonly status: Status;
  readonly data: TData;
  readonly error: any;
  readonly stale: boolean;
  cancel(): void;
  start(payload?: TPayload): void;
  restart(payload?: TPayload): void;
  watch(watcher: Callback<this>);
  dispose(): void;
}

export interface CommandCollection {
  [key: string]: Command;
}

export type Yield = (exp: YieldExpression | YieldExpression[]) => void;

export type Command<TPayload> = (
  payload?: TPayload,
  task?: Task,
  commands?: CommandCollection
) =>
  | ((run: Yield, store?: Store) => void | Promise<void>)
  | void
  | Promise<void>;

export interface Task<TResult = any> {
  readonly error: Error;
  readonly status: Status;
  success(result?: TResult): void;
  fail(error: Error): void;
}

export interface StoreOptions<TState> {
  state?: TState;
  init?: Flow;
  context?: { [key: string]: any };
  commands?: CommandCollection;
}

export function createStore<TState = any>(
  options?: StoreOptions<TState>
): Store<TState>;

export const CHANGE_EVENT: "#change";
export const LAZY_CHANGE_EVENT: "#lazy_change";
export const READY_EVENT: "#ready";
export const FAIL_EVENT: "#fail";

export default createStore;
