import { mat4 } from "wgpu-matrix";

import { terrainDownsample } from "../configuration";
import type { Context } from "../context";
import { createBuffer } from "../device";
import type { Vec3, View } from "../model";
import { useAll } from "../signal";
import { resolve, type Value } from "../value";
import { createComputer } from "./computer";
import { createRenderPipeline } from "./render";
import { createTextureLoader } from "./texture-loader";
import { createTileTextures, type TileTextures } from "./tile-textures";

export const createTerrain = async (
  { device, format, size, sampleCount }: Context,
  {
    view,
    imageryUrl,
    elevationUrl,
  }: {
    view: Value<View>;
    imageryUrl: Value<string>;
    elevationUrl: Value<string>;
  },
) => {
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

  const imageryMapBuffer = createBuffer(
    device,
    GPUBufferUsage.STORAGE,
    new Uint32Array(new Array(4 * 1024).fill(0xffffffff)),
  );

  const elevationMapBuffer = createBuffer(
    device,
    GPUBufferUsage.STORAGE,
    new Uint32Array(new Array(4 * 1024).fill(0xffffffff)),
  );

  const imageryTextures = device.createTexture({
    size: [256, 256, 256],
    format: "rgba8unorm",
    usage:
      GPUTextureUsage.TEXTURE_BINDING |
      GPUTextureUsage.COPY_DST |
      GPUTextureUsage.RENDER_ATTACHMENT,
  });

  const elevationTextures = device.createTexture({
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
    centerBuffer,
    projectionBuffer,
    sizeBuffer,
    elevationMapBuffer,
    imageryMapBuffer,
    elevationTextures,
  });

  const textureLoader = createTextureLoader({ device });

  let imageryTileTextures: TileTextures | undefined;
  let elevationTileTextures: TileTextures | undefined;

  resolve(imageryUrl).use(imageryUrl => {
    imageryTileTextures?.destroy();
    imageryTileTextures = createTileTextures({
      urlPattern: imageryUrl,
      device,
      textureLoader,
      mapBuffer: imageryMapBuffer,
      textures: imageryTextures,
    });
  });

  resolve(elevationUrl).use(elevationUrl => {
    elevationTileTextures?.destroy();
    elevationTileTextures = createTileTextures({
      urlPattern: elevationUrl,
      device,
      textureLoader,
      mapBuffer: elevationMapBuffer,
      textures: elevationTextures,
      initialDownsample: terrainDownsample,
    });
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

  const projection = mat4.identity();
  const centerData = new Uint8Array(16);
  const unsubscribe = useAll([size, resolve(view)], (size, view) => {
    const {
      center,
      distance,
      orientation: [pitch, yaw, roll],
    } = view;

    const [width, height] = size;

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
    queue.writeBuffer(sizeBuffer, 0, new Float32Array(size));
  });

  const prepare = (encoder: GPUCommandEncoder) => {
    textureLoader.load();
    computer.compute(encoder);
    pipeline.prepare(encoder);
  };

  const encode = (pass: GPURenderPassEncoder) => pipeline.encode(pass);

  const updateTextures = async () => {
    const tiles = await computer.read();
    imageryTileTextures?.update(tiles);
    elevationTileTextures?.update(tiles);
  };

  const interval = setInterval(updateTextures, 100);

  const destroy = () => {
    clearInterval(interval);
    unsubscribe();
    imageryTileTextures?.destroy();
    elevationTileTextures?.destroy();
    computer.destroy();
    pipeline.destroy();
    tilesBuffer.destroy();
    countBuffer.destroy();
    centerBuffer.destroy();
    projectionBuffer.destroy();
    sizeBuffer.destroy();
    imageryMapBuffer.destroy();
    elevationMapBuffer.destroy();
    imageryTextures.destroy();
    elevationTextures.destroy();
  };

  return { prepare, encode, destroy };
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
