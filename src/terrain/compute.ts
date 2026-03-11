import { viewLayout } from "../common";
import { tileTextureLayers } from "../configuration";
import { createBuffer } from "../device";

export const createComputePipeline = async ({
  device,
  tilesBuffer,
  countBuffer,
  elevationCacheBuffer,
  elevationMapBuffer,
  imageryMapBuffer,
  elevationTextures,
}: {
  device: GPUDevice;
  tilesBuffer: GPUBuffer;
  countBuffer: GPUBuffer;
  elevationCacheBuffer: GPUBuffer;
  imageryMapBuffer: GPUBuffer;
  elevationMapBuffer: GPUBuffer;
  elevationTextures: GPUTexture;
}) => {
  const module = device.createShaderModule({
    code:
      (await (await fetch(new URL("../common.wgsl", import.meta.url))).text()) +
      (await (await fetch(new URL("./compute.wgsl", import.meta.url))).text()),
  });

  const layout = device.createBindGroupLayout({
    entries: [
      {
        binding: 0,
        visibility: GPUShaderStage.COMPUTE,
        buffer: { type: "storage" },
      },
      {
        binding: 1,
        visibility: GPUShaderStage.COMPUTE,
        buffer: { type: "storage" },
      },
      {
        binding: 2,
        visibility: GPUShaderStage.COMPUTE,
        buffer: { type: "storage" },
      },
      {
        binding: 3,
        visibility: GPUShaderStage.COMPUTE,
        buffer: { type: "read-only-storage" },
      },
      {
        binding: 4,
        visibility: GPUShaderStage.COMPUTE,
        buffer: { type: "read-only-storage" },
      },
      {
        binding: 5,
        visibility: GPUShaderStage.COMPUTE,
        texture: { viewDimension: "2d-array" },
      },
    ],
  });

  const pipelineLayout = device.createPipelineLayout({
    bindGroupLayouts: [viewLayout(device), layout],
  });

  const pipeline = await device.createComputePipelineAsync({
    layout: pipelineLayout,
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
    arrayLayerCount: tileTextureLayers,
  });

  const bindGroup = device.createBindGroup({
    layout,
    entries: [
      { binding: 0, resource: { buffer: tilesBuffer } },
      { binding: 1, resource: { buffer: countBuffer } },
      { binding: 2, resource: { buffer: elevationCacheBuffer } },
      { binding: 3, resource: { buffer: imageryMapBuffer } },
      { binding: 4, resource: { buffer: elevationMapBuffer } },
      { binding: 5, resource: elevationTexturesView },
    ],
  });

  let reading = false;

  const compute = (pass: GPUComputePassEncoder) => {
    pass.setPipeline(pipeline);
    pass.setBindGroup(1, bindGroup);
    pass.dispatchWorkgroups(1);
  };

  const read = async () => {
    if (reading) return;
    reading = true;

    const encoder = device.createCommandEncoder();
    encoder.copyBufferToBuffer(tilesBuffer, 0, buffer, 0, buffer.size);
    encoder.copyBufferToBuffer(countBuffer, 0, countReadBuffer, 0, 4);
    device.queue.submit([encoder.finish()]);

    await Promise.all([
      countReadBuffer.mapAsync(GPUMapMode.READ),
      buffer.mapAsync(GPUMapMode.READ),
    ]);
    const [count = 0] = new Uint32Array(countReadBuffer.getMappedRange());
    const result = new Uint32Array(buffer.getMappedRange().slice(0));

    countReadBuffer.unmap();
    buffer.unmap();
    reading = false;

    return new Array(count)
      .fill(0)
      .map(
        (_, i) =>
          [
            result[i * 8] ?? 0,
            result[i * 8 + 1] ?? 0,
            result[i * 8 + 2] ?? 0,
          ] satisfies [number, number, number],
      );
  };

  const destroy = () => {
    countReadBuffer.destroy();
    buffer.destroy();
  };

  return {
    compute,
    read,
    destroy,
  };
};
