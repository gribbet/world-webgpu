import QuickLRU from "quick-lru";

import type { Vec3 } from "./model";

export type TileIndexCache<T extends NonNullable<unknown>> = ReturnType<
  typeof createTileIndexCache<T>
>;

export const createTileIndexCache = <T extends NonNullable<unknown>>(options: {
  maxSize: number;
  maxAge?: number;
  onEviction?: (key: Vec3, value: T) => void;
}) => {
  const cache = new QuickLRU<number, T>({
    ...options,
    onEviction: (key, value) => options.onEviction?.(fromKey(key), value),
  });

  const toKey = ([x = 0, y = 0, z = 0]: Vec3) =>
    y * 2 ** z + x + (4 ** (z + 1) - 1) / 3;
  const fromKey = (key: number) => {
    const z = Math.floor(Math.log(key * 3 + 1) / Math.log(4)) - 1;
    key -= (4 ** (z + 1) - 1) / 3;
    const y = Math.floor(key / 2 ** z);
    const x = key - y * 2 ** z;
    return [x, y, z] satisfies Vec3;
  };

  return {
    get: (xyz: Vec3) => cache.get(toKey(xyz)),
    set: (xyz: Vec3, value: T) => cache.set(toKey(xyz), value as unknown as T),
    delete: (xyz: Vec3) => cache.delete(toKey(xyz)),
    clear: () => cache.clear(),
  };
};
