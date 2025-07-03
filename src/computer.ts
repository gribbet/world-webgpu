import { createComputePipeline } from "./compute";

export const createComputer = async ({
  device,
  tilesBuffer,
  countBuffer,
  centerBuffer,
  projectionBuffer,
}: {
  device: GPUDevice;
  tilesBuffer: GPUBuffer;
  countBuffer: GPUBuffer;
  centerBuffer: GPUBuffer;
  projectionBuffer: GPUBuffer;
}) => {
  const computePipeline = await createComputePipeline({
    device,
    tilesBuffer,
    countBuffer,
    centerBuffer,
    projectionBuffer,
  });

  const compute = async () => {
    const encoder = device.createCommandEncoder();
    computePipeline.encode(encoder);
    device.queue.submit([encoder.finish()]);
    await device.queue.onSubmittedWorkDone();
    return await computePipeline.read();
  };

  return { compute };
};
