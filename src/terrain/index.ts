import { mat4 } from "wgpu-matrix";

import {
  imageryMipLevels,
  terrainDownsample,
  tileTextureLayers,
} from "../configuration";
import type { Context } from "../context";
import { createBuffer } from "../device";
import type { Vec3, View } from "../model";
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

    const {
      center,
      distance,
      orientation: [pitch, yaw, roll],
    } = resolve(view);

    const aspect = width / height;
    const fov = (45 / 180) * Math.PI;
    const near = distance / 100;
    const far = distance * 100;

    mat4.perspective(fov, aspect, near, far, projection);
    mat4.translate(projection, [0, 0, -distance], projection);
    mat4.rotateX(projection, pitch, projection);
    mat4.rotateY(projection, roll, projection);
    mat4.rotateZ(projection, -yaw, projection);

    const { queue } = device;
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

const positionData = ([lon, lat, alt]: Vec3, data: Uint8Array) => {
  const latRad = (lat * Math.PI) / 180;
  const mx = (lon + 180) / 360;
  const my = 0.5 - Math.log(Math.tan(Math.PI / 4 + latRad / 2)) / (2 * Math.PI);
  const dv = new DataView(data.buffer);
  dv.setUint32(0, Math.floor(mx * 2 ** 31), true);
  dv.setUint32(4, Math.floor(my * 2 ** 31), true);
  dv.setFloat32(8, alt, true);
  return data;
};
