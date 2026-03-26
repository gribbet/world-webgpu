import { colorData, positionData, viewLayout } from "../common";
import type { Context } from "../context";
import { createBuffer } from "../device";
import type { Vec3, Vec4 } from "../model";
import { effect, type Properties, resolve } from "../reactive";

export type Vertex = {
  position: Vec3;
  color: Vec4;
};

export type FillProps = {
  vertices: Vertex[];
  indices: number[];
};

export const createFillLayer = async (
  context: Context,
  { vertices, indices }: Properties<FillProps>,
) => {
  const { device, format, sampleCount } = context;

  const stride = 32;
  const maxVertices = 100000;
  const maxIndices = 300000;

  const vertexData = new Uint8Array(maxVertices * stride);
  const indexData = new Uint32Array(maxIndices);

  const vertexBuffer = createBuffer(
    device,
    GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    vertexData,
  );
  const indexBuffer = createBuffer(
    device,
    GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
    new Uint8Array(indexData.buffer),
  );

  const module = device.createShaderModule({
    code:
      (await (await fetch(new URL("./common.wgsl", import.meta.url))).text()) +
      (await (await fetch(new URL("./fill.wgsl", import.meta.url))).text()),
  });

  const bindGroupLayout = device.createBindGroupLayout({
    entries: [
      {
        binding: 0,
        visibility: GPUShaderStage.VERTEX,
        buffer: { type: "read-only-storage" },
      },
    ],
  });

  const pipelineLayout = device.createPipelineLayout({
    bindGroupLayouts: [viewLayout(device), bindGroupLayout],
  });

  const pipelineDescriptor = {
    layout: pipelineLayout,
    vertex: { module, entryPoint: "vertex" },
    primitive: { topology: "triangle-list" },
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
      targets: [
        {
          format,
          blend: {
            color: { srcFactor: "src-alpha", dstFactor: "one-minus-src-alpha" },
            alpha: { srcFactor: "one", dstFactor: "one-minus-src-alpha" },
          },
        },
      ],
    },
    multisample: { count: sampleCount },
  });

  const pickPipeline = await device.createRenderPipelineAsync({
    ...pipelineDescriptor,
    fragment: {
      module,
      entryPoint: "pick",
      targets: [{ format: "rgba32float" }, { format: "r32uint" }],
    },
    multisample: { count: 1 },
  });

  const bindGroup = device.createBindGroup({
    layout: bindGroupLayout,
    entries: [{ binding: 0, resource: { buffer: vertexBuffer } }],
  });

  let vertexCount = 0;
  let indexCount = 0;
  let dirty = false;

  effect(() => {
    const _vertices = resolve(vertices);
    const _indices = resolve(indices);
    vertexCount = Math.min(_vertices.length, maxVertices);
    indexCount = Math.min(_indices.length, maxIndices);

    for (let i = 0; i < vertexCount; i++) {
      const { position, color } = _vertices[i] ?? {};
      if (!position || !color) continue;
      const offset = i * stride;
      positionData(position, vertexData.subarray(offset));
      colorData(color, vertexData.subarray(offset + 16));
    }
    for (let i = 0; i < indexCount; i++) indexData[i] = _indices[i] ?? 0;

    dirty = true;
  });

  const update = () => {
    if (!dirty || indexCount === 0) return;
    device.queue.writeBuffer(
      vertexBuffer,
      0,
      vertexData,
      0,
      vertexCount * stride,
    );
    device.queue.writeBuffer(
      indexBuffer,
      0,
      indexData.buffer,
      0,
      indexCount * 4,
    );
    dirty = false;
  };

  const render = (
    pass: GPURenderPassEncoder,
    { pick }: { pick?: boolean } = {},
  ) => {
    if (indexCount === 0) return;
    pass.setPipeline(pick ? pickPipeline : pipeline);
    pass.setBindGroup(1, bindGroup);
    pass.setIndexBuffer(indexBuffer, "uint32");
    pass.drawIndexed(indexCount);
  };

  return {
    update,
    render,
  };
};
