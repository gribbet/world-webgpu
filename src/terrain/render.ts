import { terrainDownsample } from "../configuration";
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

  const pipeline = await device.createRenderPipelineAsync({
    layout: "auto",
    vertex: {
      module,
      entryPoint: "vertex",
      buffers: [
        {
          arrayStride: 2 * 4,
          attributes: [{ shaderLocation: 0, format: "uint32x2", offset: 0 }],
        },
      ],
    },
    fragment: {
      module,
      entryPoint: "fragment",
      targets: [{ format }],
    },
    depthStencil: {
      format: "depth24plus",
      depthWriteEnabled: true,
      depthCompare: "less",
    },
    multisample: {
      count: sampleCount,
    },
    primitive: {
      topology: "triangle-list",
      cullMode: "front",
    },
  });

  const resolution = (2 ** 8) >> terrainDownsample;
  const vertices = new Array(resolution + 1)
    .fill(0)
    .flatMap((_, x) =>
      new Array(resolution + 1)
        .fill(0)
        .flatMap((_, y) => [
          Math.floor((x / resolution) * 2 ** 31),
          Math.floor((y / resolution) * 2 ** 31),
        ]),
    );
  const indexCount = resolution * resolution * 6;
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

  const indices = new Array(resolution).fill(0).flatMap((_, x) =>
    new Array(resolution).fill(0).flatMap((_, y) => {
      const i = y * (resolution + 1) + x;
      return [
        i,
        i + (resolution + 1),
        i + (resolution + 2),
        i,
        i + (resolution + 2),
        i + 1,
      ];
    }),
  );
  const indicesBuffer = createBuffer(
    device,
    GPUBufferUsage.INDEX,
    new Uint32Array(indices),
  );

  const imageryTexturesView = imageryTextures.createView({
    dimension: "2d-array",
    arrayLayerCount: 256,
  });

  const elevationTexturesView = elevationTextures.createView({
    dimension: "2d-array",
    arrayLayerCount: 256,
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

  const prepare = (encoder: GPUCommandEncoder) =>
    encoder.copyBufferToBuffer(countBuffer, 0, indirectBuffer, 4, 4);

  const encode = (pass: GPURenderPassEncoder) => {
    pass.setPipeline(pipeline);
    pass.setVertexBuffer(0, verticesBuffer);
    pass.setIndexBuffer(indicesBuffer, "uint32");
    pass.setBindGroup(0, bindGroup);
    pass.drawIndexedIndirect(indirectBuffer, 0);
  };

  const destroy = () => {
    verticesBuffer.destroy();
    indicesBuffer.destroy();
  };

  return {
    prepare,
    encode,
    destroy,
  };
};
