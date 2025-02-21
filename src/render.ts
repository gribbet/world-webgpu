import { resolution, z } from "./configuration";
import { createBuffer } from "./device";

export const createRenderPipeline = async ({
  device,
  format,
  tilesBuffer,
  centerBuffer,
  projectionBuffer,
}: {
  device: GPUDevice;
  format: GPUTextureFormat;
  tilesBuffer: GPUBuffer;
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
      targets: [
        {
          format,
          blend: {
            alpha: { operation: "max", srcFactor: "one", dstFactor: "one" },
            color: { operation: "add", srcFactor: "src", dstFactor: "dst" },
          },
        },
      ],
    },
    primitive: {
      topology: "line-list",
    },
  });

  const vertices = new Array(resolution)
    .fill(0)
    .flatMap((_, x) =>
      new Array(resolution)
        .fill(0)
        .flatMap((_, y) => [x / (resolution - 1), y / (resolution - 1)]),
    );
  const verticesBuffer = createBuffer(
    device,
    GPUBufferUsage.VERTEX,
    new Float32Array(vertices),
  );

  const indices = new Array(resolution - 1).fill(0).flatMap((_, x) =>
    new Array(resolution - 1).fill(0).flatMap((_, y) => {
      const i = y * resolution + x;
      return [
        [i, i + 1],
        [i + 1, i + resolution + 1],
        [i + resolution + 1, i + resolution],
        [i + resolution, i],
      ].flat();
    }),
  );
  const indicesBuffer = createBuffer(
    device,
    GPUBufferUsage.INDEX,
    new Uint32Array(indices),
  );

  const bindGroup = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: tilesBuffer } },
      { binding: 1, resource: { buffer: centerBuffer } },
      { binding: 2, resource: { buffer: projectionBuffer } },
    ],
  });

  const encode = (pass: GPURenderPassEncoder) => {
    pass.setPipeline(pipeline);
    pass.setVertexBuffer(0, verticesBuffer);
    pass.setIndexBuffer(indicesBuffer, "uint32");
    pass.setBindGroup(0, bindGroup);
    pass.drawIndexed((resolution - 1) ** 2 * 2 * 2 * 2, 4 ** z);
  };

  return {
    encode,
  };
};
