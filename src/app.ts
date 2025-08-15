import { mat4 } from "wgpu-matrix";

import { createCanvas } from "./canvas";
import { createComputer } from "./computer";
import { createControl } from "./control";
import { createBuffer } from "./device";
import { earthRadius, mercator } from "./math";
import type { Position } from "./model";
import { createRenderer } from "./renderer";
import { createSignal } from "./signal";
import { createTileTextures } from "./tile-textures";

export const createApp = async () => {
  const center = createSignal<Position>([0, 0, earthRadius]);

  const { canvas, device, context, format, size } = await createCanvas();

  createControl(canvas, center);

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

  const centerBuffer = createBuffer(
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

  center.use(center =>
    device.queue.writeBuffer(
      centerBuffer,
      0,
      new Float32Array(mercator(center)),
    ),
  );

  const renderer = await createRenderer({
    device,
    context,
    format,
    size,
    tilesBuffer,
    countBuffer,
    centerBuffer,
    projectionBuffer,
    textureIndicesBuffer,
    texturesTexture,
  });

  const computer = await createComputer({
    device,
    tilesBuffer,
    countBuffer,
    centerBuffer,
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
