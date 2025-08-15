import { mat4 } from "wgpu-matrix";

import { createBuffer } from "./device";

export const createBuffers = (device: GPUDevice) => {
  const tilesBuffer = createBuffer(
    device,
    GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
    new Uint32Array(new Array(256).fill(0).flatMap(() => [0, 0, 0, 0])),
  );

  const countBuffer = createBuffer(
    device,
    GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
    new Uint32Array([0]),
  );

  const cameraBuffer = createBuffer(
    device,
    GPUBufferUsage.UNIFORM,
    new Float32Array([0, 0, 0]),
  );

  const projectionBuffer = createBuffer(
    device,
    GPUBufferUsage.UNIFORM,
    new Float32Array(mat4.identity()),
  );

  const textureIndicesBuffer = createBuffer(
    device,
    GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    new Uint32Array(new Array(256).fill(0).flatMap(() => [0, 0])),
  );

  const texturesTexture = device.createTexture({
    size: [256, 256, 256],
    format: "rgba8unorm",
    usage:
      GPUTextureUsage.TEXTURE_BINDING |
      GPUTextureUsage.COPY_DST |
      GPUTextureUsage.RENDER_ATTACHMENT,
  });

  return {
    tilesBuffer,
    countBuffer,
    cameraBuffer,
    projectionBuffer,
    textureIndicesBuffer,
    texturesTexture,
  };
};
