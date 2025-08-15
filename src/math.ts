import type { Position, Vec3 } from "./model";

export const earthRadius = 6378137;

export const mercator = ([longitude, latitude, altitude]: Position) => {
  const x = (longitude + 180) / 360;
  const s = Math.sin((latitude * Math.PI) / 180);
  const y = 0.5 - (0.5 * Math.log((1 + s) / (1 - s))) / (2 * Math.PI);
  const z = (altitude + earthRadius) / (2 * earthRadius);
  return [x, y, z] satisfies Vec3;
};
