export const SIGNAL = Symbol("signal");

export type Accessor<T> = (() => T) & { [SIGNAL]: true };

export type Properties<T> = {
  [K in keyof T]: T[K] | Accessor<T[K]>;
};

export type MapOptions<T, K> = {
  key: (item: T, i: number) => K;
};

export type Effect = {
  run: () => void;
  cleanups: (() => void)[];
  owner?: Effect;
};

let currentOwner: Effect | undefined = undefined;
let currentListener: Effect | undefined = undefined;

export const createSignal = <T>(value: T): [Accessor<T>, (v: T) => void] => {
  const subscribers = new Set<Effect>();

  const getter = (() => {
    const listener = currentListener;
    if (listener) {
      subscribers.add(listener);
      onCleanup(() => subscribers.delete(listener));
    }
    return value;
  }) as Accessor<T>;

  getter[SIGNAL] = true;

  const setter = (newValue: T) => {
    if (value === newValue) return;
    value = newValue;
    [...subscribers].forEach(_ => {
      if (subscribers.has(_)) _.run();
    });
  };

  return [getter, setter];
};

const cleanup = ({ cleanups }: Effect) => {
  cleanups.forEach(_ => _());
  cleanups.length = 0;
};

export const effect = (f: () => void | (() => void)) => {
  const run = () => {
    cleanup(effect);

    const previousOwner = currentOwner;
    const previousListener = currentListener;
    currentOwner = effect;
    currentListener = effect;

    try {
      const cleanup = f();
      if (cleanup) onCleanup(cleanup);
    } finally {
      currentOwner = previousOwner;
      currentListener = previousListener;
    }
  };

  const effect = {
    run,
    owner: currentOwner,
    cleanups: [],
  } satisfies Effect;

  onCleanup(() => cleanup(effect));

  run();
};

export const onCleanup = (f: () => void) => currentOwner?.cleanups.push(f);

export const derived = <T>(f: () => T): Accessor<T> => {
  const [value, setValue] = createSignal<T>(undefined as T);
  effect(() => setValue(f()));
  return value;
};

type MapFn = {
  <T, U>(
    list: T[] | Accessor<T[]>,
    mapper: (item: T, i: Accessor<number>) => U,
  ): Accessor<U[]>;
  <T, K, U>(
    list: T[] | Accessor<T[]>,
    mapper: (item: Accessor<T>, i: Accessor<number>) => U,
    options: MapOptions<T, K>,
  ): Accessor<U[]>;
};

export const map: MapFn = <T, K, U>(
  list: T[] | Accessor<T[]>,
  mapper:
    | ((item: T, i: Accessor<number>) => U)
    | ((item: Accessor<T>, i: Accessor<number>) => U),
  options?: MapOptions<T, K>,
): Accessor<U[]> => {
  if (options) {
    type Entry = {
      value: U;
      setItem: (item: T) => void;
      setIndex: (i: number) => void;
      dispose: () => void;
    };

    let cache = new Map<K, Entry>();

    onCleanup(() => cache.forEach(_ => _.dispose()));

    return derived(() => {
      const nextList = resolve(list);
      const next: [K, Entry][] = [];
      const seen = new Set<K>();

      nextList.forEach((item, i) => {
        const key = options.key(item, i);
        if (seen.has(key))
          throw new Error(`Duplicate key in map: ${String(key)}`);
        seen.add(key);

        let entry = cache.get(key);
        if (entry) {
          entry.setItem(item);
          entry.setIndex(i);
          cache.delete(key);
        } else {
          const [itemValue, setItem] = createSignal(item);
          const [index, setIndex] = createSignal(i);
          entry = createRoot(dispose => {
            const value = (
              mapper as (item: Accessor<T>, i: Accessor<number>) => U
            )(itemValue, index);
            return {
              value,
              setItem,
              setIndex,
              dispose,
            };
          });
        }

        next.push([key, entry]);
      });

      cache.forEach(_ => _.dispose());
      cache = new Map(next);

      return next.map(([, entry]) => entry.value);
    });
  }

  type Entry = { value: U; setIndex: (i: number) => void; dispose: () => void };
  let cache = new Map<T, Entry>();

  onCleanup(() => cache.forEach(_ => _.dispose()));

  return derived(() => {
    const nextList = resolve(list);
    const next: [T, Entry][] = nextList.map((item, i) => {
      let entry = cache.get(item);
      if (entry) {
        entry.setIndex(i);
        cache.delete(item);
      } else {
        const [index, setIndex] = createSignal(i);
        entry = createRoot(dispose => {
          const value = (mapper as (item: T, i: Accessor<number>) => U)(
            item,
            index,
          );
          return {
            value,
            setIndex,
            dispose,
          };
        });
      }
      return [item, entry] as const;
    });
    cache.forEach(_ => _.dispose());
    cache = new Map(next);
    return next.map(([, entry]) => entry.value);
  });
};

export const createRoot = <T>(f: (dispose: () => void) => T): T => {
  const root = {
    run: () => {},
    cleanups: [],
    owner: currentOwner,
  } satisfies Effect;

  const previousOwner = currentOwner;
  const previousListener = currentListener;
  currentOwner = root;
  currentListener = undefined;

  try {
    return f(() => cleanup(root));
  } finally {
    currentOwner = previousOwner;
    currentListener = previousListener;
  }
};

export const resolve = <T>(value: T | Accessor<T>): T =>
  typeof value === "function" && SIGNAL in value ? value() : value;
