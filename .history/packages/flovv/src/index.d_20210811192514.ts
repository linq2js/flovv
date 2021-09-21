export type Flow<TPayload = any, TResult = void> =
  | ((payload: TPayload) => FlowGenerator<TResult>)
  | (() => FlowGenerator<TResult>);

export type FlowGenerator<TResult = any> = Generator<
  YieldExpression | YieldExpression[],
  TResult,
  any
>;

export type DelayExpression = { delay: number };

export type FlowExpression = { start: Flow | Flow[] };

export type StartExpression = { start: Flow | [Flow, any] };

export type RestartExpression = { restart: Flow | [Flow, any] };

export type OnExpression = { on: { [event: string]: Function } };

export type WhenExpression = {
  when:
    | string
    | string[]
    | { [event: string]: (payload?: any) => boolean }
    | Flow;
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

export type SetExpression = {
  set: { [state: string]: ((prev: any) => any) | any } | [Flow | string, any];
};

export type GetExpression = {
  get: string | Flow | (string | Flow)[];
};

export type RefExpression = {
  ref: string | Flow | (string | Flow)[];
};

export type ThrottleExpression = {};

export type DebounceExpression = {};

export type RefExpression = {
  ref: string | string[];
};

export type ForkExpression = {
  fork: FlowGenerator | FlowGenerator[] | YieldExpression;
};

export type CallExpression = {
  call: Function | [Function, ...any[]];
};

export type CancelExpression = {
  cancel: boolean | Flow | null | undefined;
};

export type Callback<T = any> = (arg?: T) => void;

export type OnceExpression = {
  once: Flow | Flow[];
};

export type UseExpression = {
  use: CommandCollection | CommandCollection[];
};

export type YieldExpression =
  | UseExpression
  | FlowExpression
  | StartExpression
  | RestartExpression
  | RefExpression
  | OnceExpression
  | ForkExpression
  | SetExpression
  | GetExpression
  | RefExpression
  | DelayExpression
  | OnExpression
  | CancelExpression
  | WhenExpression
  | EmitExpression
  | AnyExpression
  | AllExpression
  | DoneExpression
  | FlowGenerator
  | Promise<any>;

export interface Store<TState> {
  readonly state: TState;
  watch(watcher: Callback<TState>);
  emit(event: string, payload?: any): void;
  on(event: string, listener: Callback): void;
  flow<TPayload, TResult>(
    definition: Flow<TPayload, TResult>
  ): Flow<TPayload, TResult>;
  start<TPayload, TResult>(
    definition: Flow<TPayload, TResult>,
    payload?: TPayload
  ): TResult;
  restart<TPayload, TResult>(
    definition: Flow<TPayload, TResult>,
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
) => (() => YieldExpression | YieldExpression[]) | void | Promise<void>;

export interface Options<TState> {
  state?: TState;
  init?: Flow;
  commands?: CommandCollection;
}

export function createStore<TState>(options?: Options<TState>): Store<TState>;

export default createStore;
