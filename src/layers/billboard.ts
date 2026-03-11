import { mat4 } from "wgpu-matrix";

import { colorData, positionData, projectionData } from "../common";
import type { Context } from "../context";
import { createBuffer } from "../device";
import type { Vec3, Vec4, View } from "../model";
import { createEffect, type Properties, resolve } from "../reactive";

export type Billboard = {
  position: Vec3;
  color: Vec4;
};

export type BillboardProps = {
  view: View;
  billboards: Billboard[];
};

export const createBillboardLayer = async (
  context: Context,
  { view, billboards }: Properties<BillboardProps>,
) => {
  const { device, format, sampleCount, size } = context;

  const maxBillboards = 10000;
  const billboardData = new Uint8Array(maxBillboards * 32);
  const billboardsBuffer = createBuffer(
    device,
    GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    billboardData,
  );

  const centerBuffer = createBuffer(
    device,
    GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    new Uint8Array(16),
  );

  const projectionBuffer = createBuffer(
    device,
    GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    new Float32Array(16),
  );

  const sizeBuffer = createBuffer(
    device,
    GPUBufferUsage.UNIFORM,
    new Float32Array([1, 1]),
  );

  const module = device.createShaderModule({
    code:
      (await (await fetch(new URL("../common.wgsl", import.meta.url))).text()) +
      (await (
        await fetch(new URL("./billboard.wgsl", import.meta.url))
      ).text()),
  });

  const bindGroupLayout = device.createBindGroupLayout({
    entries: [
      {
        binding: 0,
        visibility: GPUShaderStage.VERTEX,
        buffer: { type: "uniform" },
      },
      {
        binding: 1,
        visibility: GPUShaderStage.VERTEX,
        buffer: { type: "uniform" },
      },
      {
        binding: 2,
        visibility: GPUShaderStage.VERTEX,
        buffer: { type: "uniform" },
      },
      {
        binding: 3,
        visibility: GPUShaderStage.VERTEX,
        buffer: { type: "read-only-storage" },
      },
    ],
  });

  const pipelineLayout = device.createPipelineLayout({
    bindGroupLayouts: [bindGroupLayout],
  });

  const pipeline = await device.createRenderPipelineAsync({
    layout: pipelineLayout,
    vertex: {
      module,
      entryPoint: "vertex",
    },
    fragment: {
      module,
      entryPoint: "render",
      targets: [{ format }],
    },
    primitive: {
      topology: "triangle-strip",
    },
    depthStencil: {
      format: "depth24plus",
      depthWriteEnabled: true,
      depthCompare: "less",
    },
    multisample: {
      count: sampleCount,
    },
  });

  const pickPipeline = await device.createRenderPipelineAsync({
    layout: pipelineLayout,
    vertex: {
      module,
      entryPoint: "vertex",
    },
    fragment: {
      module,
      entryPoint: "pick",
      targets: [{ format: "rgba32float" }],
    },
    primitive: {
      topology: "triangle-strip",
      cullMode: "none",
    },
    depthStencil: {
      format: "depth24plus",
      depthWriteEnabled: true,
      depthCompare: "less",
    },
    multisample: {
      count: 1,
    },
  });

  const bindGroup = device.createBindGroup({
    layout: bindGroupLayout,
    entries: [
      { binding: 0, resource: { buffer: centerBuffer } },
      { binding: 1, resource: { buffer: projectionBuffer } },
      { binding: 2, resource: { buffer: sizeBuffer } },
      { binding: 3, resource: { buffer: billboardsBuffer } },
    ],
  });

  createEffect(() => {
    const list = resolve(billboards);
    const n = Math.min(list.length, maxBillboards);
    for (let i = 0; i < n; i++) {
      const billboard = list[i];
      if (!billboard) continue;
      const { position, color } = billboard;
      const offset = i * 32;
      positionData(position, billboardData.subarray(offset));
      colorData(color, billboardData.subarray(offset + 16));
    }
    device.queue.writeBuffer(billboardsBuffer, 0, billboardData, 0, n * 32);
  });

  const projection = mat4.identity();
  const centerData = new Uint8Array(16);
  createEffect(() => {
    const [width, height] = size();
    const { center } = resolve(view);
    const { queue } = device;
    projectionData(resolve(view), size(), projection);
    queue.writeBuffer(projectionBuffer, 0, projection);
    queue.writeBuffer(centerBuffer, 0, positionData(center, centerData));
    queue.writeBuffer(sizeBuffer, 0, new Float32Array([width, height]));
  });

  return {
    render: (pass: GPURenderPassEncoder, { pick }: { pick?: boolean } = {}) => {
      const count = resolve(billboards).length;
      if (count === 0) return;
      pass.setPipeline(pick ? pickPipeline : pipeline);
      pass.setBindGroup(0, bindGroup);
      pass.draw(4, Math.min(count, maxBillboards), 0, 0);
    },
  };
};
