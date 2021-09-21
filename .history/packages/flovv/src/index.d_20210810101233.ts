export type Flow<TPayload = any, TResult = void> = (
  payload?: TPayload
) => Generator<YieldExpression, TResult, any>;

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

export type SetExpression = {
  set: { [state: string]: ((prev: any) => any) | any };
};

export type GetExpression = {
  get: string | string[];
};

export type ForkExpression = { fork: any };

export type YieldExpression =
  | ForkExpression
  | SetExpression
  | GetExpression
  | DelayExpression
  | OnExpression
  | WhenExpression
  | EmitExpression
  | AnyExpression
  | AllExpression
  | DoneExpression;
