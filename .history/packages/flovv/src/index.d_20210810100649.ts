export type Flow<TPayload = any, TResult = void> = (
  payload?: TPayload
) => Generator<YieldExpression, TResult, any>;

export type YieldExpression =
  | { delay: number }
  | { on: { [event: string]: Function } }
  | { any: { [key: string]: YieldExpression } | YieldExpression[] }
  | { all: { [key: string]: YieldExpression } | YieldExpression[] }
  | { done: { [key: string]: YieldExpression } | YieldExpression[] };
