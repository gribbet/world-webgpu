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
  { imageryUrl, elevationUrl }: Properties<TerrainProps>,
) => {
  const { device } = context;

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

  const computePipeline = await createComputePipeline({
    device,
    tilesBuffer,
    countBuffer,
    elevationCacheBuffer,
    imageryMapBuffer,
    elevationMapBuffer,
    elevationTextures,
  });

  const pipeline = await createRenderPipeline({
    context,
    tilesBuffer,
    countBuffer,
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

  const compute = (pass: GPUComputePassEncoder) => {
    computePipeline.compute(pass);
  };

  const update = (encoder: GPUCommandEncoder) => {
    textureLoader.update();
    elevationTileTextures?.update(encoder);
    imageryTileTextures?.update(encoder);
    pipeline.update(encoder);
  };

  const render = (
    pass: GPURenderPassEncoder,
    { pick }: { pick?: boolean } = {},
  ) => {
    pipeline.render(pass, { pick });
  };

  const updateTextures = async () => {
    const tiles = await computePipeline.read();
    if (!tiles) return;
    imageryTileTextures?.load(tiles);
    elevationTileTextures?.load(tiles);
  };

  const timer = setInterval(() => void updateTextures(), 100);

  onCleanup(() => {
    clearInterval(timer);
    computePipeline.destroy();
    pipeline.destroy();
    tilesBuffer.destroy();
    countBuffer.destroy();
    elevationCacheBuffer.destroy();
    imageryMapBuffer.destroy();
    elevationMapBuffer.destroy();
    imageryTextures.destroy();
    elevationTextures.destroy();
  });

  return {
    compute,
    update,
    render,
  };
};
