/* eslint-disable @typescript-eslint/ban-types */
/* eslint-disable @typescript-eslint/no-explicit-any */

export type Flow<TPayload = any, TResult = void> =
  | ((payload: TPayload) => FlowGenerator<TResult>)
  | (() => FlowGenerator<TResult>);

export type FlowGenerator<TResult = any> = Generator<
  YieldExpression | YieldExpression[],
  TResult,
  any
>;

export type Callback<T = any> = (arg?: T) => void;

export type YieldExpression =
  | FlowGenerator
  | Promise<any>
  | {
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

      ref?: string | Flow | (string | Flow)[];
      get?: string | Flow | (string | Flow)[];
      set?:
        | { [state: string]: ((prev: any) => any) | any }
        | [Flow | string, any];
      select?: ((state: any) => any) | ((state: any) => any)[];
      context?: string | string[] | { [key: string]: any };

      start?: Flow | [Flow, any];
      restart?: Flow | [Flow, any];

      fork?: FlowGenerator | FlowGenerator[] | YieldExpression;
      call?: Function | [Function, ...any[]];
      cancel?: "previous" | boolean | Flow | null | undefined;

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

      [key: string]: any;
    };

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
  success(result: TResult): void;
  fail(error: Error): void;
}

export interface Options<TState> {
  state?: TState;
  init?: Flow;
  context?: { [key: string]: any };
  commands?: CommandCollection;
}

export function createStore<TState>(options?: Options<TState>): Store<TState>;

export default createStore;
