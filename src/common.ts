import { mat4 } from "wgpu-matrix";

import type { Context } from "./context";
import type { Vec3, Vec4, View } from "./model";
import type { Properties } from "./reactive";

export type Layer = {
  update?: (encode: GPUCommandEncoder) => void;
  render: (pass: GPURenderPassEncoder, options?: { pick?: boolean }) => void;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type LayerFactory<P extends Record<string, unknown> = any> = (
  context: Context,
  props: Properties<P>,
) => Layer | Promise<Layer>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type LayerDefinition<P extends Record<string, unknown> = any> =
  readonly [LayerFactory<P>, P];

export const positionData = ([lon, lat, alt]: Vec3, data: Uint8Array) => {
  const latRad = (lat * Math.PI) / 180;
  const mx = (lon + 180) / 360;
  const my = 0.5 - Math.log(Math.tan(Math.PI / 4 + latRad / 2)) / (2 * Math.PI);
  const view = new DataView(data.buffer, data.byteOffset);
  view.setUint32(0, Math.floor(mx * 2 ** 31), true);
  view.setUint32(4, Math.floor(my * 2 ** 31), true);
  view.setFloat32(8, alt, true);
  return data;
};

export const colorData = ([r, g, b, a]: Vec4, data: Uint8Array) => {
  const view = new DataView(data.buffer, data.byteOffset);
  view.setFloat32(0, r, true);
  view.setFloat32(4, g, true);
  view.setFloat32(8, b, true);
  view.setFloat32(12, a, true);
  return data;
};

export const projectionData = (
  view: View,
  [width, height]: [number, number],
  projection: Float32Array,
) => {
  const {
    distance,
    orientation: [pitch, yaw, roll],
  } = view;

  const aspect = width / height;
  const fov = (45 / 180) * Math.PI;
  const near = distance / 100;
  const far = distance * 100;

  mat4.perspective(fov, aspect, near, far, projection);
  mat4.translate(projection, [0, 0, -distance], projection);
  mat4.rotateX(projection, pitch, projection);
  mat4.rotateY(projection, roll, projection);
  mat4.rotateZ(projection, -yaw, projection);
  return projection;
};
