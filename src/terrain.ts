import { mat4 } from "wgpu-matrix";

import { createComputer } from "./computer";
import type { Context } from "./context";
import { createBuffer } from "./device";
import type { Vec3 } from "./model";
import { createRenderPipeline } from "./render";
import { useAll } from "./signal";
import { createTextureLoader } from "./texture-loader";
import type { TileTextures } from "./tile-textures";
import { createTileTextures } from "./tile-textures";
import { resolve, type Value } from "./value";

export const createTerrain = async (
  { device, format, size, sampleCount }: Context,
  { camera, urlPattern }: { camera: Value<Vec3>; urlPattern: Value<string> },
) => {
  let tiles: Vec3[] = [];

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

  const textures = device.createTexture({
    size: [256, 256, 256],
    format: "rgba8unorm",
    usage:
      GPUTextureUsage.TEXTURE_BINDING |
      GPUTextureUsage.COPY_DST |
      GPUTextureUsage.RENDER_ATTACHMENT,
  });

  const computer = await createComputer({
    device,
    tilesBuffer,
    countBuffer,
    cameraBuffer,
    projectionBuffer,
  });

  const textureLoader = createTextureLoader({ device });

  let tileTextures: TileTextures | undefined;

  resolve(urlPattern).use(urlPattern => {
    tileTextures?.destroy();
    tileTextures = createTileTextures({
      urlPattern,
      device,
      textureLoader,
      textureIndicesBuffer,
      textures,
    });
  });

  const pipeline = await createRenderPipeline({
    device,
    format,
    sampleCount,
    tilesBuffer,
    countBuffer,
    cameraBuffer,
    projectionBuffer,
    textureIndicesBuffer,
    textures,
  });

  const unsubscribe = useAll([size, resolve(camera)], (size, camera) => {
    const [, , z] = camera;
    const [width, height] = size;
    const aspect = width / height;
    const fov = 45;
    const near = (z - 1) / 10;
    const far = (z - 1) * 10;
    const projection = mat4.multiply(
      mat4.perspective((fov / 180) * Math.PI, aspect, near, far),
      mat4.scaling([1, -1, 1]),
    );
    device.queue.writeBuffer(projectionBuffer, 0, new Float32Array(projection));
    device.queue.writeBuffer(cameraBuffer, 0, new Float32Array(camera));
  });

  const prepare = async () => {
    tiles = await computer.compute();
  };

  const encode = (pass: GPURenderPassEncoder) => {
    tileTextures?.update(tiles);
    pipeline.encode(pass, tiles.length);
    textureLoader.load();
  };

  const destroy = () => {
    unsubscribe();
    tileTextures?.destroy();
    computer.destroy();
    pipeline.destroy();
    tilesBuffer.destroy();
    countBuffer.destroy();
    cameraBuffer.destroy();
    projectionBuffer.destroy();
    textureIndicesBuffer.destroy();
    textures.destroy();
  };

  return { prepare, encode, destroy };
};
