import { createBuffer } from "./device";

export const createComputePipeline = async ({
  device,
  tilesBuffer,
}: {
  device: GPUDevice;
  tilesBuffer: GPUBuffer;
}) => {
  const module = device.createShaderModule({
    code: await (
      await fetch(new URL("./compute.wgsl", import.meta.url))
    ).text(),
  });

  const pipeline = device.createComputePipeline({
    layout: "auto",
    compute: {
      module,
      entryPoint: "main",
    },
  });

  const areasBuffer = createBuffer(
    device,
    GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
    new Float32Array(tilesBuffer.size / Float32Array.BYTES_PER_ELEMENT),
  );

  const buffer = device.createBuffer({
    size: areasBuffer.size,
    usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
  });

  const bindGroup = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: tilesBuffer } },
      { binding: 1, resource: { buffer: areasBuffer } },
    ],
  });

  const encode = (encoder: GPUCommandEncoder) => {
    const pass = encoder.beginComputePass();
    pass.setBindGroup(0, bindGroup);
    pass.setPipeline(pipeline);
    pass.dispatchWorkgroups(64);
    pass.end();
    encoder.copyBufferToBuffer(areasBuffer, 0, buffer, 0, buffer.size);
  };

  const read = async () => {
    await buffer.mapAsync(GPUMapMode.READ);
    const result = new Float32Array(buffer.getMappedRange().slice(0));
    buffer.unmap();
    return result;
  };

  return {
    encode,
    read,
  };
};
