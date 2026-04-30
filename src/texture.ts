import { onCleanup } from "./reactive";

export const createTexture = (
  device: GPUDevice,
  descriptor: GPUTextureDescriptor,
): GPUTexture => {
  const texture = device.createTexture(descriptor);
  onCleanup(() => texture.destroy());
  return texture;
};
