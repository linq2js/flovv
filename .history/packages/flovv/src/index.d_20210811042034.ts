export type Definition<TPayload = any, TResult = void> = (
  payload?: TPayload
) => FlowGenerator<TResult>;

export type FlowGenerator<TResult = any> = Generator<
  YieldExpression,
  TResult,
  any
>;

export type DelayExpression = { delay: number };

export type OnExpression = { on: { [event: string]: Function } };

export type WhenExpression = {
  when: string | string[] | { [event: string]: (payload?: any) => boolean };
};

export type EmitExpression = {
  emit: string | string[] | { [event: string]: any };
};

export type AnyExpression = {
  any: { [key: string]: YieldExpression } | YieldExpression[];
};

export type AllExpression = {
  all: { [key: string]: YieldExpression } | YieldExpression[];
};

export type DoneExpression = {
  done: { [key: string]: YieldExpression } | YieldExpression[];
};

export type StartExpression = {
  start: Definition | [Definition, any];
};

export type SetExpression = {
  set: { [state: string]: ((prev: any) => any) | any };
};

export type GetExpression = {
  get: string | string[];
};

export type ForkExpression = {
  fork: FlowGenerator | FlowGenerator[] | { [key: string]: FlowGenerator };
};

export type CallExpression = {
  call: Function | [Function, ...any[]];
};

export type TaskExpression = {
  task: "dispose" | "cancel";
};

export type Callback<T = any> = (arg?: T) => void;

export type OnceExpression = {
  once: Definition | Definition[];
};

export type YieldExpression =
  | OnceExpression
  | ForkExpression
  | SetExpression
  | GetExpression
  | DelayExpression
  | OnExpression
  | WhenExpression
  | EmitExpression
  | AnyExpression
  | AllExpression
  | DoneExpression
  | TaskExpression
  | FlowGenerator
  | Promise<any>;

export interface Store<TState> {
  readonly state: TState;
  watch(watcher: Callback<TState>);
  emit(event: string, payload?: any): void;
  on(event: string, listener: Callback): void;
  flow<TPayload, TResult>(
    definition: Definition<TPayload, TResult>
  ): Flow<TPayload, TResult>;
  start<TPayload, TResult>(
    definition: Definition<TPayload, TResult>,
    payload?: TPayload
  ): TResult;
  restart<TPayload, TResult>(
    definition: Definition<TPayload, TResult>,
    payload?: TPayload
  ): TResult;
}
export type Status = undefined | "loading" | "success" | "fail";

export interface Flow<TPayload, TData> extends Promise<TData> {
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

export type Command<TPayload> = (
  payload?: TPayload,
  task?: Task,
  commands?: CommandCollection
) => any;

export interface Options<TState> {
  state?: TState;
  commands?: CommandCollection;
}

export function createStore<TState>(options?: Options<TState>): Store<TState>;

export default createStore;