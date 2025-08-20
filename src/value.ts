import { createSignal, type Signal, signalSymbol } from "./signal";

export type Value<T> = T | Signal<T>;

export const resolve = <T>(value: Value<T>): Signal<T> => {
  if (typeof value === "object" && value && signalSymbol in value) return value;
  return createSignal(value);
};
