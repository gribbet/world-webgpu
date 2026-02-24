export type LruOptions<K, V> = {
  maxSize: number;
  maxAge?: number;
  onEviction?: (key: K, value: V) => void;
};

export const createLru = <K, V>({
  maxSize,
  maxAge,
  onEviction,
}: LruOptions<K, V>) => {
  const mapping = new Map<K, { value: V; timestamp: number }>();

  const evict = (key: K) => {
    const entry = mapping.get(key);
    if (!entry) return;
    mapping.delete(key);
    onEviction?.(key, entry.value);
  };

  const isExpired = (timestamp: number) =>
    maxAge !== undefined && Date.now() - timestamp > maxAge;

  const get = (key: K): V | undefined => {
    const entry = mapping.get(key);
    if (!entry) return undefined;

    if (isExpired(entry.timestamp)) {
      evict(key);
      return undefined;
    }

    mapping.delete(key);
    mapping.set(key, { ...entry, timestamp: Date.now() });
    return entry.value;
  };

  const set = (key: K, value: V) => {
    if (mapping.has(key)) mapping.delete(key);
    else if (mapping.size >= maxSize) {
      const firstKey = mapping.keys().next().value;
      if (firstKey !== undefined) evict(firstKey);
    }
    mapping.set(key, { value, timestamp: Date.now() });
  };

  const _delete = (key: K) => mapping.delete(key);

  const clear = () => mapping.clear();

  const has = (key: K) => {
    const entry = mapping.get(key);
    if (entry && isExpired(entry.timestamp)) {
      evict(key);
      return false;
    }
    return !!entry;
  };

  const keys = () => mapping.keys();

  return {
    get,
    set,
    delete: _delete,
    clear,
    has,
    keys,
    get size() {
      return mapping.size;
    },
  };
};
