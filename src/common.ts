import type { Context } from "./context";
import type { Vec3, Vec4 } from "./model";
import type { Properties } from "./reactive";

export type Layer = {
  compute?: (pass: GPUComputePassEncoder) => void;
  update?: (encode: GPUCommandEncoder) => void;
  render: (pass: GPURenderPassEncoder, options?: { pick?: boolean }) => void;
};

export type LayerFactory<P> = (
  context: Context,
  props: Properties<P>,
) => Layer | Promise<Layer>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type LayerDefinition<P = any> = readonly [LayerFactory<P>, P];

export const viewLayout = (device: GPUDevice) =>
  device.createBindGroupLayout({
    entries: [0, 1, 2].map(binding => ({
      binding,
      visibility:
        GPUShaderStage.VERTEX |
        GPUShaderStage.FRAGMENT |
        GPUShaderStage.COMPUTE,
      buffer: { type: "uniform" },
    })),
  });

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

export const limit = (n: number) => {
  let active = 0;
  const queue: (() => void)[] = [];
  return async () => {
    if (active >= n) await new Promise<void>(_ => queue.push(_));
    active++;
    return () => {
      active--;
      queue.shift()?.();
    };
  };
};
