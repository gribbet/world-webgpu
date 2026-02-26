import { tileTextureLayers } from "../configuration";
import { createBuffer } from "../device";

export const createComputePipeline = async ({
  device,
  tilesBuffer,
  countBuffer,
  centerBuffer,
  projectionBuffer,
  sizeBuffer,
  elevationCacheBuffer,
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
    arrayLayerCount: tileTextureLayers,
  });

  const bindGroup = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: tilesBuffer } },
      { binding: 1, resource: { buffer: countBuffer } },
      { binding: 2, resource: { buffer: centerBuffer } },
      { binding: 3, resource: { buffer: projectionBuffer } },
      { binding: 4, resource: { buffer: sizeBuffer } },
      { binding: 5, resource: { buffer: elevationCacheBuffer } },
      { binding: 6, resource: { buffer: imageryMapBuffer } },
      { binding: 7, resource: { buffer: elevationMapBuffer } },
      { binding: 8, resource: elevationTexturesView },
    ],
  });

  let reading = false;

  const compute = (encoder: GPUCommandEncoder) => {
    const pass = encoder.beginComputePass();
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.dispatchWorkgroups(1);
    pass.end();
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
