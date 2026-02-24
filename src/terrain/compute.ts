import { createBuffer } from "../device";

export const createComputePipeline = async ({
  device,
  tilesBuffer,
  countBuffer,
  centerBuffer,
  projectionBuffer,
  sizeBuffer,
  elevationMapBuffer,
  imageryMapBuffer,
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
  const module = device.createShaderModule({
    code:
      (await (await fetch(new URL("../common.wgsl", import.meta.url))).text()) +
      (await (await fetch(new URL("./compute.wgsl", import.meta.url))).text()),
  });

  const pipeline = await device.createComputePipelineAsync({
    layout: "auto",
    compute: {
      module,
      entryPoint: "main",
    },
  });

  const countReadBuffer = createBuffer(
    device,
    GPUBufferUsage.MAP_READ,
    new Uint32Array([0]),
  );

  const buffer = device.createBuffer({
    size: tilesBuffer.size,
    usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
  });

  const elevationTexturesView = elevationTextures.createView({
    dimension: "2d-array",
    arrayLayerCount: 256,
  });

  const bindGroup = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: centerBuffer } },
      { binding: 1, resource: { buffer: projectionBuffer } },
      { binding: 2, resource: { buffer: sizeBuffer } },
      { binding: 3, resource: { buffer: tilesBuffer } },
      { binding: 4, resource: { buffer: countBuffer } },
      { binding: 5, resource: { buffer: imageryMapBuffer } },
      { binding: 6, resource: { buffer: elevationMapBuffer } },
      { binding: 7, resource: elevationTexturesView },
    ],
  });

  const encode = (encoder: GPUCommandEncoder) => {
    const pass = encoder.beginComputePass();
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.dispatchWorkgroups(1);
    pass.end();
  };

  const read = async () => {
    const encoder = device.createCommandEncoder();
    encoder.copyBufferToBuffer(tilesBuffer, 0, buffer, 0, buffer.size);
    encoder.copyBufferToBuffer(countBuffer, 0, countReadBuffer, 0, 4);
    device.queue.submit([encoder.finish()]);
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
            result[i * 8] ?? 0,
            result[i * 8 + 1] ?? 0,
            result[i * 8 + 2] ?? 0,
          ] satisfies [number, number, number],
      );
    return tiles;
  };

  const destroy = () => {
    countReadBuffer.destroy();
    buffer.destroy();
  };

  return {
    encode,
    read,
    destroy,
  };
};
