import type { Vec3 } from "../../model";

export const toKey = ([x = 0, y = 0, z = 0]: Vec3) =>
  y * 2 ** z + x + (4 ** (z + 1) - 1) / 3;

export const fromKey = (key: number) => {
  const z = Math.floor(Math.log(key * 3 + 1) / Math.log(4)) - 1;
  key -= (4 ** (z + 1) - 1) / 3;
  const y = Math.floor(key / 2 ** z);
  const x = key - y * 2 ** z;
  return [x, y, z] satisfies Vec3;
};
