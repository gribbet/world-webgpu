import { tileTextureLayers } from "../configuration";
import { createBuffer } from "../device";

export const createRenderPipeline = async ({
  device,
  format,
  sampleCount,
  tilesBuffer,
  countBuffer,
  centerBuffer,
  projectionBuffer,
  imageryTextures,
  elevationTextures,
}: {
  device: GPUDevice;
  format: GPUTextureFormat;
  sampleCount: number;
  tilesBuffer: GPUBuffer;
  countBuffer: GPUBuffer;
  centerBuffer: GPUBuffer;
  projectionBuffer: GPUBuffer;
  imageryTextures: GPUTexture;
  elevationTextures: GPUTexture;
}) => {
  const module = device.createShaderModule({
    code:
      (await (await fetch(new URL("../common.wgsl", import.meta.url))).text()) +
      (await (await fetch(new URL("./render.wgsl", import.meta.url))).text()),
  });

  const pipelineDescriptor = {
    layout: "auto",
    vertex: {
      module,
      entryPoint: "vertex",
      buffers: [
        {
          arrayStride: 3 * 4,
          attributes: [{ shaderLocation: 0, format: "uint32x3", offset: 0 }],
        },
      ],
    },
    primitive: {
      topology: "triangle-list",
      cullMode: "front",
    },
    depthStencil: {
      format: "depth24plus",
      depthWriteEnabled: true,
      depthCompare: "less",
    },
  } satisfies GPURenderPipelineDescriptor;

  const pipeline = await device.createRenderPipelineAsync({
    ...pipelineDescriptor,
    fragment: {
      module,
      entryPoint: "render",
      targets: [{ format }],
    },
    multisample: {
      count: sampleCount,
    },
  });

  const pickPipeline = await device.createRenderPipelineAsync({
    ...pipelineDescriptor,
    fragment: {
      module,
      entryPoint: "pick",
      targets: [{ format: "rgba32float" }],
    },
    multisample: {
      count: 1,
    },
  });

  const resolution = 21;
  const count = resolution + 2;
  const vertices = new Array(count + 1)
    .fill(0)
    .flatMap((_, x) =>
      new Array(count + 1)
        .fill(0)
        .flatMap((_, y) => [
          ...[x, y].map(
            _ =>
              (Math.min(Math.max(_ - 1, 0), resolution) / resolution) * 2 ** 31,
          ),
          [x, y].some(_ => _ === 0 || _ === count) ? 1 : 0,
        ]),
    );
  const indexCount = count ** 2 * 6;
  const indirectBuffer = createBuffer(
    device,
    GPUBufferUsage.INDIRECT | GPUBufferUsage.COPY_DST,
    new Uint32Array([indexCount, 0, 0, 0, 0]),
  );
  const verticesBuffer = createBuffer(
    device,
    GPUBufferUsage.VERTEX,
    new Uint32Array(vertices),
  );

  const indices = new Array(count).fill(0).flatMap((_, x) =>
    new Array(count).fill(0).flatMap((_, y) => {
      const i = y * (count + 1) + x;
      return [i, i + (count + 1), i + (count + 2), i, i + (count + 2), i + 1];
    }),
  );
  const indicesBuffer = createBuffer(
    device,
    GPUBufferUsage.INDEX,
    new Uint32Array(indices),
  );

  const imageryTexturesView = imageryTextures.createView({
    dimension: "2d-array",
    arrayLayerCount: tileTextureLayers,
  });

  const elevationTexturesView = elevationTextures.createView({
    dimension: "2d-array",
    arrayLayerCount: tileTextureLayers,
  });

  const sampler = device.createSampler({
    magFilter: "linear",
    minFilter: "linear",
    mipmapFilter: "linear",
    maxAnisotropy: 16,
  });

  const bindGroup = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: tilesBuffer } },
      { binding: 1, resource: { buffer: centerBuffer } },
      { binding: 2, resource: { buffer: projectionBuffer } },
      { binding: 3, resource: imageryTexturesView },
      { binding: 4, resource: elevationTexturesView },
      { binding: 5, resource: sampler },
    ],
  });

  const pickBindGroup = device.createBindGroup({
    layout: pickPipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: tilesBuffer } },
      { binding: 1, resource: { buffer: centerBuffer } },
      { binding: 2, resource: { buffer: projectionBuffer } },
      { binding: 4, resource: elevationTexturesView },
    ],
  });

  const update = (encoder: GPUCommandEncoder) =>
    encoder.copyBufferToBuffer(countBuffer, 0, indirectBuffer, 4, 4);

  const render = (
    pass: GPURenderPassEncoder,
    { pick }: { pick?: boolean } = {},
  ) => {
    pass.setPipeline(pick ? pickPipeline : pipeline);
    pass.setVertexBuffer(0, verticesBuffer);
    pass.setIndexBuffer(indicesBuffer, "uint32");
    pass.setBindGroup(0, pick ? pickBindGroup : bindGroup);
    pass.drawIndexedIndirect(indirectBuffer, 0);
  };

  const destroy = () => {
    verticesBuffer.destroy();
    indicesBuffer.destroy();
  };

  return {
    update,
    render,
    destroy,
  };
};
