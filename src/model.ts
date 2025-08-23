export type Vec3 = [number, number, number];

export type View = {
  target: Vec3;
  distance: number;
  orientation: Vec3;
};
