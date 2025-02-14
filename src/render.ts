import { mat4 } from "wgpu-matrix";

import { resolution } from "./configuration";
import { createBuffer } from "./device";

export const createRenderPipeline = async ({
  device,
  format,
}: {
  device: GPUDevice;
  format: GPUTextureFormat;
}) => {
  const module = device.createShaderModule({
    code: await (await fetch(new URL("./render.wgsl", import.meta.url))).text(),
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

  const vertices = createBuffer(
    device,
    GPUBufferUsage.VERTEX,
    new Float32Array(
      new Array(resolution)
        .fill(0)
        .flatMap((_, x) =>
          new Array(resolution)
            .fill(0)
            .flatMap((_, y) => [x / (resolution - 1), y / (resolution - 1)]),
        ),
    ),
  );

  const indices = createBuffer(
    device,
    GPUBufferUsage.INDEX,
    new Uint32Array(
      new Array(resolution - 1).fill(0).flatMap((_, x) =>
        new Array(resolution - 1).fill(0).flatMap((_, y) => {
          const i = y * resolution + x;
          return [
            [i, i + 1],
            [i + 1, i + resolution + 1],
            [i + resolution + 1, i + resolution],
            [i + resolution, i],
          ].flat();
        }),
      ),
    ),
  );

  const z = 1;
  const tiles = createBuffer(
    device,
    GPUBufferUsage.STORAGE,
    new Uint32Array(
      new Array(2 ** z)
        .fill(0)
        .flatMap((_, x) =>
          new Array(2 ** z).fill(0).flatMap((_, y) => [x, y, z, 0]),
        ),
    ),
  );

  const center = createBuffer(
    device,
    GPUBufferUsage.UNIFORM,
    new Uint32Array([0, 0, 0]),
  );

  const projection = createBuffer(
    device,
    GPUBufferUsage.UNIFORM,
    new Float32Array(mat4.perspective((60 / 180) * Math.PI, 1, 1e-9, 10)),
  );

  const bindGroup = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: tiles } },
      { binding: 1, resource: { buffer: center } },
      { binding: 2, resource: { buffer: projection } },
    ],
  });

  const frame = () => {
    device.queue.writeBuffer(
      center,
      0,
      new Uint32Array(
        [
          performance.now() / 1e3,
          0.5 + 0.25 * Math.sin(performance.now() / 1e3),
          1,
        ].map(_ => _ * (2 ** 32 - 1)),
      ),
    );
    requestAnimationFrame(frame);
  };
  frame();

  const encode = (pass: GPURenderPassEncoder) => {
    pass.setPipeline(pipeline);
    pass.setVertexBuffer(0, vertices);
    pass.setIndexBuffer(indices, "uint32");
    pass.setBindGroup(0, bindGroup);
    pass.drawIndexed((resolution - 1) ** 2 * 2 * 2 * 2, 4 ** z);
  };

  return {
    encode,
  };
};
