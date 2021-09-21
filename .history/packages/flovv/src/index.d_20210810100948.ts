export type Flow<TPayload = any, TResult = void> = (
  payload?: TPayload
) => Generator<YieldExpression, TResult, any>;

export type DelayExpression = { delay: number };

export type OnExpression = { on: { [event: string]: Function } };

export type WhenExpression = {
  when: string | string[] | { [event: string]: (payload?: any) => boolean };
};

export type YieldExpression =
  | DelayExpression
  | OnExpression
  | WhenExpression
  | { emit: string | string[] | { [event: string]: any } }
  | { any: { [key: string]: YieldExpression } | YieldExpression[] }
  | { all: { [key: string]: YieldExpression } | YieldExpression[] }
  | { done: { [key: string]: YieldExpression } | YieldExpression[] };
