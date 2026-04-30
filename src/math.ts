import type { Vec2, Vec3 } from "./model";

export const lonLatFromMercator = (mx: number, my: number): Vec2 => {
  const lon = (mx / 2 ** 31) * 360 - 180;
  const lat =
    (Math.atan(Math.sinh((0.5 - my / 2 ** 31) * (2 * Math.PI))) * 180) /
    Math.PI;
  return [lon, lat];
};

export const mercatorFromLonLat = (
  lon: number,
  lat: number,
): [number, number] => {
  const latRad = (lat * Math.PI) / 180;
  const mx = (lon + 180) / 360;
  const my = 0.5 - Math.log(Math.tan(Math.PI / 4 + latRad / 2)) / (2 * Math.PI);
  return [Math.floor(mx * 2 ** 31), Math.floor(my * 2 ** 31)];
};

export const enuFromPosition = (center: Vec3, position: Vec3): Vec3 => {
  const [centerLon, centerLat, centerAlt] = center;
  const [lon, lat, alt] = position;

  const radius = 6378137.0;
  const r = radius + centerAlt;
  const centerLatRad = (centerLat * Math.PI) / 180;

  const dLonRad = ((lon - centerLon) * Math.PI) / 180;
  const dLatRad = ((lat - centerLat) * Math.PI) / 180;

  const x = dLonRad * r * Math.cos(centerLatRad);
  const y = -dLatRad * r;
  const z = alt - centerAlt;

  return [x, y, z];
};

export const move = (
  center: Vec3,
  enu: readonly [number, number, number],
): Vec3 => {
  const [lon, lat, alt] = center;
  const [x, y, z] = enu;

  const radius = 6378137.0;
  const r = radius + alt;
  const latRad = (lat * Math.PI) / 180;

  const lonDelta = (x / (r * Math.cos(latRad))) * (180 / Math.PI);
  const latDelta = (y / r) * (180 / Math.PI);

  return [lon + lonDelta, lat + latDelta, alt + z];
};
