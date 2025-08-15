import { mat4 } from "wgpu-matrix";

import { createCanvas } from "./canvas";
import { createComputer } from "./computer";
import { createControl } from "./control";
import { createBuffer } from "./device";
import type { Position } from "./model";
import { createRenderer } from "./renderer";
import { createSignal } from "./signal";
import { createTileTextures } from "./tile-textures";

export const createApp = async () => {
  const camera = createSignal<Position>([0.25, 0.375, 2]);

  const { canvas, device, context, format, size } = await createCanvas();

  createControl(canvas, camera);

  let tiles: [number, number, number][] = [[0, 0, 0]];
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

  camera.use(camera =>
    device.queue.writeBuffer(cameraBuffer, 0, new Float32Array(camera)),
  );

  const renderer = await createRenderer({
    device,
    context,
    format,
    size,
    tilesBuffer,
    countBuffer,
    cameraBuffer,
    projectionBuffer,
    textureIndicesBuffer,
    texturesTexture,
  });

  const computer = await createComputer({
    device,
    tilesBuffer,
    countBuffer,
    cameraBuffer,
    projectionBuffer,
  });

  const textures = createTileTextures({
    device,
    textureIndicesBuffer,
    texturesTexture,
  });

  let running = false;
  const frame = async () => {
    requestAnimationFrame(frame);
    if (running) return;
    running = true;

    tiles = await computer.compute();
    await textures.update(tiles);
    await renderer.render(tiles.length);

    running = false;
  };
  requestAnimationFrame(frame);
};
