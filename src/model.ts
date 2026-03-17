export type Vec3 = readonly [number, number, number];
export type Vec4 = readonly [number, number, number, number];

export type View = {
  center: Vec3;
  distance: number;
  orientation: Vec3;
};
