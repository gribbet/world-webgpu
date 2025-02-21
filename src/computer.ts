import { createComputePipeline } from "./compute";

export const createComputer = async ({
  device,
  tilesBuffer,
  centerBuffer,
  projectionBuffer,
}: {
  device: GPUDevice;
  tilesBuffer: GPUBuffer;
  centerBuffer: GPUBuffer;
  projectionBuffer: GPUBuffer;
}) => {
  const computePipeline = await createComputePipeline({
    device,
    tilesBuffer,
    centerBuffer,
    projectionBuffer,
  });

  const compute = async () => {
    const encoder = device.createCommandEncoder();
    computePipeline.encode(encoder);
    device.queue.submit([encoder.finish()]);
    await device.queue.onSubmittedWorkDone();
    console.log(await computePipeline.read());
  };

  return { compute };
};
