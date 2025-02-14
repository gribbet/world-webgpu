export type Signal<T> = {
  set: (_: T) => void;
  use: (_: (_: T) => void) => void;
};

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
    set,
    use,
  } satisfies Signal<T>;
};
