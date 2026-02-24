import type { Vec3 } from "../model";
import { fromKey, toKey } from "./common";
import { createLru } from "./lru";

export type TileIndexCache<T extends NonNullable<unknown>> = ReturnType<
  typeof createTileIndexCache<T>
>;

export const createTileIndexCache = <T extends NonNullable<unknown>>(options: {
  maxSize: number;
  maxAge?: number;
  onEviction?: (key: Vec3, value: T) => void;
}) => {
  const cache = createLru<number, T>({
    ...options,
    onEviction: (key, value) => options.onEviction?.(fromKey(key), value),
  });

  return {
    get: (xyz: Vec3) => cache.get(toKey(xyz)),
    set: (xyz: Vec3, value: T) => cache.set(toKey(xyz), value),
    delete: (xyz: Vec3) => cache.delete(toKey(xyz)),
    clear: () => cache.clear(),
  };
};
