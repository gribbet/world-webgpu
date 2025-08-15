import { resolution } from "./configuration";
import { createBuffer } from "./device";

export const createRenderPipeline = async ({
  device,
  format,
  sampleCount,
  tilesBuffer,
  countBuffer,
  cameraBuffer,
  projectionBuffer,
  textureIndicesBuffer,
  texturesTexture,
}: {
  device: GPUDevice;
  format: GPUTextureFormat;
  sampleCount: number;
  tilesBuffer: GPUBuffer;
  countBuffer: GPUBuffer;
  cameraBuffer: GPUBuffer;
  projectionBuffer: GPUBuffer;
  textureIndicesBuffer: GPUBuffer;
  texturesTexture: GPUTexture;
}) => {
  const module = device.createShaderModule({
    code:
      (await (await fetch(new URL("./common.wgsl", import.meta.url))).text()) +
      (await (await fetch(new URL("./render.wgsl", import.meta.url))).text()),
  });

  const pipeline = device.createRenderPipeline({
    layout: "auto",
    vertex: {
      module,
      entryPoint: "vertex",
      buffers: [
        {
          arrayStride: 2 * 4,
          attributes: [{ shaderLocation: 0, format: "float32x2", offset: 0 }],
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
    },
  });

  const vertices = new Array(resolution + 1)
    .fill(0)
    .flatMap((_, x) =>
      new Array(resolution + 1)
        .fill(0)
        .flatMap((_, y) => [x / resolution, y / resolution]),
    );
  const verticesBuffer = createBuffer(
    device,
    GPUBufferUsage.VERTEX,
    new Float32Array(vertices),
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

  const textures = texturesTexture.createView({
    dimension: "2d-array",
    arrayLayerCount: 256,
  });

  const sampler = device.createSampler({
    magFilter: "linear",
    minFilter: "linear",
  });

  const bindGroup = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: tilesBuffer } },
      { binding: 1, resource: { buffer: countBuffer } },
      { binding: 2, resource: { buffer: cameraBuffer } },
      { binding: 3, resource: { buffer: projectionBuffer } },
      { binding: 4, resource: { buffer: textureIndicesBuffer } },
      { binding: 5, resource: textures },
      { binding: 6, resource: sampler },
    ],
  });

  const encode = (pass: GPURenderPassEncoder, count: number) => {
    if (count === 0) return;
    pass.setPipeline(pipeline);
    pass.setVertexBuffer(0, verticesBuffer);
    pass.setIndexBuffer(indicesBuffer, "uint32");
    pass.setBindGroup(0, bindGroup);
    pass.drawIndexed(resolution ** 2 * 6, count);
  };

  return {
    encode,
  };
};
