import { onCleanup } from "@gribbet/signal.ts";

export const createTexture = (
  device: GPUDevice,
  descriptor: GPUTextureDescriptor,
): GPUTexture => {
  const texture = device.createTexture(descriptor);
  onCleanup(() => texture.destroy());
  return texture;
};
