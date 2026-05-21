import type { Vec2, Vec3, Vec4, View } from "./model";

export const EARTH_CIRCUMFERENCE = 40075017; // meters

export const vec3Distance = (a: Vec3, b: Vec3): number => {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  const dz = a[2] - b[2];
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
};

export const vec3Add = (
  a: Vec3,
  b: readonly [number, number, number],
): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];

export const vec3Sub = (
  a: Vec3,
  b: readonly [number, number, number],
): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];

export const vec3Scale = (v: Vec3, scale: number): Vec3 => [
  v[0] * scale,
  v[1] * scale,
  v[2] * scale,
];

// Convert lat/lon to mercator projection (normalized 0-1)
export const latLonToMercator = (lon: number, lat: number): Vec2 => {
  const x = (lon + 180) / 360;
  const latRad = (lat * Math.PI) / 180;
  const y = 0.5 - Math.log(Math.tan(Math.PI / 4 + latRad / 2)) / (2 * Math.PI);
  return [x, y];
};

// Convert mercator to lat/lon
export const mercatorToLatLon = (x: number, y: number): Vec2 => {
  const lon = x * 360 - 180;
  const lat = (Math.atan(Math.sinh((0.5 - y) * (2 * Math.PI))) * 180) / Math.PI;
  return [lon, lat];
};

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

// Spherical linear interpolation between two quaternions
export const slerp = (from: Vec4, to: Vec4, t: number): Vec4 => {
  const [x1, y1, z1, w1] = from;
  let [x2, y2, z2, w2] = to;

  let dot = x1 * x2 + y1 * y2 + z1 * z2 + w1 * w2;

  if (dot < 0) {
    x2 = -x2;
    y2 = -y2;
    z2 = -z2;
    w2 = -w2;
    dot = -dot;
  }

  if (dot > 0.9995)
    return [
      x1 + (x2 - x1) * t,
      y1 + (y2 - y1) * t,
      z1 + (z2 - z1) * t,
      w1 + (w2 - w1) * t,
    ];

  const theta0 = Math.acos(dot);
  const theta = theta0 * t;

  const sinTheta0 = Math.sin(theta0);
  const sinTheta = Math.sin(theta);

  const s0 = Math.cos(theta) - (dot * sinTheta) / sinTheta0;
  const s1 = sinTheta / sinTheta0;

  return [
    x1 * s0 + x2 * s1,
    y1 * s0 + y2 * s1,
    z1 * s0 + z2 * s1,
    w1 * s0 + w2 * s1,
  ];
};

// Given a screen pixel (px, py), intersect the camera ray with the horizontal
// plane at the given altitude (meters) and return the world position.
// Returns null if the ray is parallel to or pointing away from the plane.
export const pickFlat = (
  px: number,
  py: number,
  altitude: number,
  view: View,
  size: readonly [number, number],
): Vec3 | null => {
  const { center, distance, orientation, fieldOfView } = view;
  const [yaw, pitch, roll] = orientation;
  const [width, height] = size;

  const fov = (fieldOfView / 180) * Math.PI;
  const fieldScale = Math.tan(Math.PI / 8) / Math.tan(fov / 2);
  const d = distance * fieldScale;

  const sinRoll = Math.sin(roll);
  const cosRoll = Math.cos(roll);
  const sinPitch = Math.sin(pitch);
  const cosPitch = Math.cos(pitch);
  const sinYaw = Math.sin(yaw);
  const cosYaw = Math.cos(yaw);

  // Camera ENU position = Rz(yaw) * Rx(-pitch) * Ry(-roll) * [0, 0, d]
  const c1x = -sinRoll * d;
  const c1y = sinPitch * cosRoll * d;
  const c1z = cosPitch * cosRoll * d;
  const camX = cosYaw * c1x - sinYaw * c1y;
  const camY = sinYaw * c1x + cosYaw * c1y;
  const camZ = c1z;

  // Ray direction from pixel in view space, then rotate to ENU
  const nx = (2 * px) / width - 1;
  const ny = 1 - (2 * py) / height;
  const aspect = width / height;
  const tanHalfFov = Math.tan(fov / 2);
  const rvx = nx * aspect * tanHalfFov;
  const rvy = ny * tanHalfFov;
  const rvz = -1;

  // Apply Ry(-roll)
  const r1x = cosRoll * rvx - sinRoll * rvz;
  const r1y = rvy;
  const r1z = sinRoll * rvx + cosRoll * rvz;

  // Apply Rx(-pitch)
  const r2x = r1x;
  const r2y = cosPitch * r1y + sinPitch * r1z;
  const r2z = -sinPitch * r1y + cosPitch * r1z;

  // Apply Rz(yaw)
  const rdx = cosYaw * r2x - sinYaw * r2y;
  const rdy = sinYaw * r2x + cosYaw * r2y;
  const rdz = r2z;

  if (Math.abs(rdz) < 1e-10) return null;
  const t = (altitude - center[2] - camZ) / rdz;
  if (t < 0) return null;

  return move(center, [camX + t * rdx, camY + t * rdy, altitude - center[2]]);
};
