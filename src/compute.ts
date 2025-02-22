import { createBuffer } from "./device";

export const createComputePipeline = async ({
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
  const module = device.createShaderModule({
    code:
      (await (await fetch(new URL("./common.wgsl", import.meta.url))).text()) +
      (await (await fetch(new URL("./compute.wgsl", import.meta.url))).text()),
  });

  const pipeline = device.createComputePipeline({
    layout: "auto",
    compute: {
      module,
      entryPoint: "main",
    },
  });

  const resultBuffer = createBuffer(
    device,
    GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
    new Uint32Array(1024 * 4),
  );

  const countBuffer = createBuffer(
    device,
    GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
    new Uint32Array([0]),
  );

  const countReadBuffer = createBuffer(
    device,
    GPUBufferUsage.MAP_READ,
    new Uint32Array([0]),
  );

  const buffer = device.createBuffer({
    size: resultBuffer.size,
    usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
  });

  const bindGroup = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: tilesBuffer } },
      { binding: 1, resource: { buffer: centerBuffer } },
      { binding: 2, resource: { buffer: projectionBuffer } },
      { binding: 3, resource: { buffer: resultBuffer } },
      { binding: 4, resource: { buffer: countBuffer } },
    ],
  });

  const encode = (encoder: GPUCommandEncoder) => {
    encoder.clearBuffer(countBuffer, 0, countBuffer.size);
    const pass = encoder.beginComputePass();
    pass.setBindGroup(0, bindGroup);
    pass.setPipeline(pipeline);
    pass.dispatchWorkgroups(64);
    pass.end();
    encoder.copyBufferToBuffer(resultBuffer, 0, buffer, 0, buffer.size);
    encoder.copyBufferToBuffer(
      countBuffer,
      0,
      countReadBuffer,
      0,
      countReadBuffer.size,
    );
  };

  const read = async () => {
    await Promise.all([
      countReadBuffer.mapAsync(GPUMapMode.READ),
      buffer.mapAsync(GPUMapMode.READ),
    ]);
    const [count = 0] = new Uint32Array(countReadBuffer.getMappedRange());
    countReadBuffer.unmap();
    const result = new Uint32Array(buffer.getMappedRange().slice(0));
    buffer.unmap();
    const tiles = new Array(count)
      .fill(0)
      .map(
        (_, i) =>
          [
            result[i * 4] ?? 0,
            result[i * 4 + 1] ?? 0,
            result[i * 4 + 2] ?? 0,
          ] as const,
      );
    return tiles;
  };

  return {
    encode,
    read,
  };
};
