import { createComputePipeline } from "./compute";

export const createComputer = async ({
  device,
  tilesBuffer,
  countBuffer,
  targetBuffer,
  projectionBuffer,
}: {
  device: GPUDevice;
  tilesBuffer: GPUBuffer;
  countBuffer: GPUBuffer;
  targetBuffer: GPUBuffer;
  projectionBuffer: GPUBuffer;
}) => {
  const computePipeline = await createComputePipeline({
    device,
    tilesBuffer,
    countBuffer,
    targetBuffer,
    projectionBuffer,
  });

  const compute = async () => {
    const encoder = device.createCommandEncoder();
    computePipeline.encode(encoder);
    device.queue.submit([encoder.finish()]);
    await device.queue.onSubmittedWorkDone();
    return await computePipeline.read();
  };

  const { destroy } = computePipeline;

  return { compute, destroy };
};
