import type { Properties } from "signals.ts";

import type { Context } from "./context";

export type Layer = {
  compute?: (pass: GPUComputePassEncoder) => void;
  update?: (encode: GPUCommandEncoder) => void;
  render: (pass: GPURenderPassEncoder) => void;
  pick?: (pass: GPURenderPassEncoder) => void;
};

export type LayerFactory<P> = (
  context: Context,
  props: Properties<P>,
) => Layer | Promise<Layer>;

export type LayerDescriptor = <R>(
  apply: <P>(factory: LayerFactory<P>, properties: Properties<P>) => R,
) => R;

export const createLayerType =
  <P>(factory: LayerFactory<P>) =>
  (properties: Properties<P>): LayerDescriptor =>
  <R>(apply: <Q>(factory: LayerFactory<Q>, properties: Properties<Q>) => R) =>
    apply(factory, properties);

export const createLayer = (
  context: Context,
  descriptor: LayerDescriptor,
): Layer | Promise<Layer> =>
  descriptor((factory, properties) => factory(context, properties));

export const viewLayout = (device: GPUDevice) =>
  device.createBindGroupLayout({
    entries: [
      {
        binding: 0,
        visibility:
          GPUShaderStage.VERTEX |
          GPUShaderStage.FRAGMENT |
          GPUShaderStage.COMPUTE,
        buffer: { type: "uniform" },
      },
    ],
  });

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

export const createLock = () => {
  let pending = Promise.resolve();
  return async () => {
    const previous = pending;
    let resolve = () => {};
    pending = new Promise(_ => (resolve = _));
    await previous;
    return resolve;
  };
};
