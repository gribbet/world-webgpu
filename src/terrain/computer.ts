import { createComputePipeline } from "./compute";

export const createComputer = async ({
  device,
  tilesBuffer,
  countBuffer,
  centerBuffer,
  projectionBuffer,
  sizeBuffer,
  imageryMapBuffer,
  elevationMapBuffer,
  elevationTextures,
}: {
  device: GPUDevice;
  tilesBuffer: GPUBuffer;
  countBuffer: GPUBuffer;
  centerBuffer: GPUBuffer;
  projectionBuffer: GPUBuffer;
  sizeBuffer: GPUBuffer;
  imageryMapBuffer: GPUBuffer;
  elevationMapBuffer: GPUBuffer;
  elevationTextures: GPUTexture;
}) => {
  const computePipeline = await createComputePipeline({
    device,
    tilesBuffer,
    countBuffer,
    centerBuffer,
    projectionBuffer,
    sizeBuffer,
    imageryMapBuffer,
    elevationMapBuffer,
    elevationTextures,
  });

  const compute = (encoder: GPUCommandEncoder) =>
    computePipeline.encode(encoder);

  const read = async () => await computePipeline.read();

  const { destroy } = computePipeline;

  return { compute, read, destroy };
};
