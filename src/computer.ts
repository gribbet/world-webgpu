import { createComputePipeline } from "./compute";

export const createComputer = async ({
  device,
  tilesBuffer,
}: {
  device: GPUDevice;
  tilesBuffer: GPUBuffer;
}) => {
  const computePipeline = await createComputePipeline({
    device,
    tilesBuffer,
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
