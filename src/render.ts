import { resolution, z } from "./configuration";
import { createBuffer } from "./device";

export const createRenderPipeline = async ({
  device,
  format,
  tilesBuffer,
  countBuffer,
  centerBuffer,
  projectionBuffer,
}: {
  device: GPUDevice;
  format: GPUTextureFormat;
  tilesBuffer: GPUBuffer;
  countBuffer: GPUBuffer;
  centerBuffer: GPUBuffer;
  projectionBuffer: GPUBuffer;
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
    primitive: {
      topology: "triangle-strip",
      stripIndexFormat: "uint32",
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

  const texturesArray = device.createTexture({
    size: [256, 256, 256],
    format: "rgba8unorm",
    usage:
      GPUTextureUsage.TEXTURE_BINDING |
      GPUTextureUsage.COPY_DST |
      GPUTextureUsage.RENDER_ATTACHMENT,
  });

  const textures = texturesArray.createView({
    dimension: "2d-array",
    arrayLayerCount: 256,
  });

  const response = await fetch(new URL("./0.jpg", import.meta.url).toString());
  const blob = await response.blob();
  const bitmap = await createImageBitmap(blob);

  device.queue.copyExternalImageToTexture(
    { source: bitmap, flipY: true },
    {
      texture: texturesArray,
      origin: { x: 0, y: 0, z: 0 },
    },
    { width: 256, height: 256 },
  );

  const sampler = device.createSampler({
    magFilter: "linear",
    minFilter: "linear",
  });

  const bindGroup = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: tilesBuffer } },
      { binding: 1, resource: { buffer: countBuffer } },
      { binding: 2, resource: { buffer: centerBuffer } },
      { binding: 3, resource: { buffer: projectionBuffer } },
      { binding: 4, resource: textures },
      { binding: 5, resource: sampler },
    ],
  });

  const encode = (pass: GPURenderPassEncoder) => {
    pass.setPipeline(pipeline);
    pass.setVertexBuffer(0, verticesBuffer);
    pass.setIndexBuffer(indicesBuffer, "uint32");
    pass.setBindGroup(0, bindGroup);
    pass.drawIndexed(resolution ** 2 * 6, 4 ** z);
  };

  return {
    encode,
  };
};
