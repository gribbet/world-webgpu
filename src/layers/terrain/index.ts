import { terrainDownsample } from "../../configuration";
import type { Context } from "../../context";
import { createBuffer } from "../../device";
import { derived, onCleanup, type Properties, resolve } from "../../reactive";
import { createComputePipeline } from "./compute";
import { createRenderPipeline } from "./render";
import { createTileMapBuffer } from "./tile-map-buffer";
import { createTileTextureGroup } from "./tile-texture-group";

export type TerrainProps = {
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

  const imageryMap = createTileMapBuffer(device);

  const imagery = derived(() =>
    createTileTextureGroup({
      context,
      map: imageryMap,
      urlPattern: resolve(imageryUrl),
    }),
  );

  const imageryTextures = derived(() => imagery().texture());

  const elevationMap = createTileMapBuffer(device);

  const elevation = derived(() =>
    createTileTextureGroup({
      context,
      map: elevationMap,
      urlPattern: resolve(elevationUrl),
      initialDownsample: terrainDownsample,
    }),
  );

  const elevationTextures = derived(() => elevation().texture());

  const computePipeline = await createComputePipeline({
    device,
    tilesBuffer,
    countBuffer,
    imageryMapBuffer: imageryMap.buffer,
    elevationMapBuffer: elevationMap.buffer,
    elevationTextures,
  });

  const pipeline = await createRenderPipeline({
    context,
    tilesBuffer,
    countBuffer,
    imageryTextures,
    elevationTextures,
  });

  const compute = (pass: GPUComputePassEncoder) =>
    computePipeline.compute(pass);

  const update = (encoder: GPUCommandEncoder) => {
    imageryMap.update(encoder);
    elevationMap.update(encoder);
    pipeline.update(encoder);
  };

  const render = (
    pass: GPURenderPassEncoder,
    { pick }: { pick?: boolean } = {},
  ) => pipeline.render(pass, { pick });

  const updateTextures = async () => {
    const tiles = await computePipeline.read();
    if (!tiles) return;
    imagery().ensure(tiles);
    elevation().ensure(tiles);
  };

  const timer = setInterval(() => void updateTextures(), 100);

  onCleanup(() => {
    clearInterval(timer);
    computePipeline.destroy();
    pipeline.destroy();
    tilesBuffer.destroy();
    countBuffer.destroy();
  });

  return {
    compute,
    update,
    render,
  };
};
