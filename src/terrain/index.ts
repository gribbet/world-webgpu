import { mat4 } from "wgpu-matrix";

import { positionData, projectionData } from "../common";
import {
  imageryMipLevels,
  terrainDownsample,
  tileTextureLayers,
} from "../configuration";
import type { Context } from "../context";
import { createBuffer } from "../device";
import type { View } from "../model";
import { createEffect, onCleanup, type Properties, resolve } from "../reactive";
import { createComputePipeline } from "./compute";
import { createRenderPipeline } from "./render";
import { createTextureLoader } from "./texture-loader";
import { createTileTextures, type TileTextures } from "./tile-textures";

export type TerrainProps = {
  view: View;
  imageryUrl: string;
  elevationUrl: string;
};

export const createTerrain = async (
  context: Context,
  { view, imageryUrl, elevationUrl }: Properties<TerrainProps>,
) => {
  const { device, format, size, sampleCount } = context;

  const tilesBuffer = createBuffer(
    device,
    GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
    new Uint32Array(new Array(1024 * 8).fill(0)),
  );

  const countBuffer = createBuffer(
    device,
    GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
    new Uint32Array([0]),
  );

  const centerBuffer = createBuffer(
    device,
    GPUBufferUsage.UNIFORM,
    new Uint8Array(16),
  );

  const projectionBuffer = createBuffer(
    device,
    GPUBufferUsage.UNIFORM,
    new Float32Array(mat4.identity()),
  );

  const sizeBuffer = createBuffer(
    device,
    GPUBufferUsage.UNIFORM,
    new Float32Array([1, 1]),
  );

  const elevationCacheBuffer = createBuffer(
    device,
    GPUBufferUsage.STORAGE,
    new Uint32Array(new Array(4 * 16376).fill(0xffffffff)),
  );

  const imageryMapBuffer = createBuffer(
    device,
    GPUBufferUsage.STORAGE,
    new Uint32Array(new Array(4 * 4096).fill(0xffffffff)),
  );

  const elevationMapBuffer = createBuffer(
    device,
    GPUBufferUsage.STORAGE,
    new Uint32Array(new Array(4 * 4096).fill(0xffffffff)),
  );

  const imageryTextures = device.createTexture({
    size: [256, 256, tileTextureLayers],
    format: "rgba8unorm",
    mipLevelCount: imageryMipLevels,
    usage:
      GPUTextureUsage.TEXTURE_BINDING |
      GPUTextureUsage.COPY_DST |
      GPUTextureUsage.RENDER_ATTACHMENT,
  });

  const elevationTextures = device.createTexture({
    size: [256, 256, tileTextureLayers],
    format: "rgba8unorm",
    usage:
      GPUTextureUsage.TEXTURE_BINDING |
      GPUTextureUsage.COPY_DST |
      GPUTextureUsage.RENDER_ATTACHMENT,
  });

  const compute = await createComputePipeline({
    device,
    tilesBuffer,
    countBuffer,
    centerBuffer,
    projectionBuffer,
    sizeBuffer,
    elevationCacheBuffer,
    imageryMapBuffer,
    elevationMapBuffer,
    elevationTextures,
  });

  const pipeline = await createRenderPipeline({
    device,
    format,
    sampleCount,
    tilesBuffer,
    countBuffer,
    centerBuffer,
    projectionBuffer,
    imageryTextures,
    elevationTextures,
  });

  const textureLoader = createTextureLoader({ device });

  let imageryTileTextures: TileTextures | undefined;
  let elevationTileTextures: TileTextures | undefined;

  createEffect(() => {
    const textures = createTileTextures({
      urlPattern: resolve(imageryUrl),
      device,
      textureLoader,
      mapBuffer: imageryMapBuffer,
      textures: imageryTextures,
      mipLevelCount: imageryMipLevels,
    });
    imageryTileTextures = textures;
    onCleanup(() => textures.destroy());
  });

  createEffect(() => {
    const textures = createTileTextures({
      urlPattern: resolve(elevationUrl),
      device,
      textureLoader,
      mapBuffer: elevationMapBuffer,
      textures: elevationTextures,
      initialDownsample: terrainDownsample,
    });
    elevationTileTextures = textures;
    onCleanup(() => textures.destroy());
  });

  const projection = mat4.identity();
  const centerData = new Uint8Array(16);
  createEffect(() => {
    const [width, height] = size();
    const { center } = resolve(view);
    const { queue } = device;
    projectionData(resolve(view), size(), projection);
    queue.writeBuffer(projectionBuffer, 0, projection);
    queue.writeBuffer(centerBuffer, 0, positionData(center, centerData));
    queue.writeBuffer(sizeBuffer, 0, new Float32Array([width, height]));
  });

  const update = (encoder: GPUCommandEncoder) => {
    textureLoader.update();
    imageryTileTextures?.update(encoder);
    elevationTileTextures?.update(encoder);
    compute.compute(encoder);
    pipeline.update(encoder);
  };

  const render = (
    pass: GPURenderPassEncoder,
    { pick }: { pick?: boolean } = {},
  ) => {
    pipeline.render(pass, { pick });
  };

  const updateTextures = async () => {
    const tiles = await compute.read();
    if (!tiles) return;
    imageryTileTextures?.load(tiles);
    elevationTileTextures?.load(tiles);
  };

  const timer = setInterval(() => void updateTextures(), 100);

  onCleanup(() => {
    clearInterval(timer);
    compute.destroy();
    pipeline.destroy();
    tilesBuffer.destroy();
    countBuffer.destroy();
    centerBuffer.destroy();
    projectionBuffer.destroy();
    sizeBuffer.destroy();
    elevationCacheBuffer.destroy();
    imageryMapBuffer.destroy();
    elevationMapBuffer.destroy();
    imageryTextures.destroy();
    elevationTextures.destroy();
  });

  return {
    update,
    render,
  };
};
