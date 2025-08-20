export type Signal<T> = ReturnType<typeof createSignal<T>>;

export const signalSymbol = Symbol("signal");

export const createSignal = <T>(value: T) => {
  type Handler = (_: T) => void;
  const handlers: Handler[] = [];

  const set = (_: T) => {
    value = _;
    handlers.forEach(handler => handler(_));
  };

  const use = (handler: Handler) => {
    handlers.push(handler);
    handler(value);
    return () => {
      const index = handlers.indexOf(handler);
      if (index === -1) return;
      handlers.splice(index, 1);
    };
  };

  return {
    [signalSymbol]: true,
    set,
    use,
  };
};

export const useAll = <T extends unknown[]>(
  signals: { [K in keyof T]: Signal<T[K]> },
  handler: (...values: T) => void,
) => {
  const values = [] as unknown as T;
  const ready = new Array(signals.length).fill(false);

  const unsubscribes = signals.map((_, i) =>
    _.use(_ => {
      values[i] = _;
      ready[i] = true;
      if (ready.every(_ => _)) handler(...values);
    }),
  );

  return () => {
    unsubscribes.forEach(_ => _());
  };
};
