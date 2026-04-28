import {
  colorData,
  createLayerType,
  positionData,
  viewLayout,
} from "../../common";
import { createBuffer } from "../../device";
import type { Vec3, Vec4 } from "../../model";
import { effect, onCleanup, resolve } from "../../reactive";
import { createLayerPipelines } from "../common";

export type LinePoint = {
  position: Vec3;
  color: Vec4;
  width: number;
};

export type Line = {
  points: LinePoint[];
};

export type LineProps = {
  lines: Line[];
};

const MAX_POINTS = 200000;
const MAX_NODES = 200000;
const POINT_STRIDE = 32; // Position(12) + width(4) + color(16)
const NODE_STRIDE = 16; // prev, current, next, pickId
const OUT_VERTEX_STRIDE = 64; // 4 x vec4

export const line = createLayerType<LineProps>(async (context, { lines }) => {
  const { device, pickRegistry } = context;

  const pointData = new Uint8Array(MAX_POINTS * POINT_STRIDE);
  const nodeData = new Uint8Array(MAX_NODES * NODE_STRIDE);
  const nodeCountData = new Uint32Array(1);
  const indexData = new Uint32Array(MAX_NODES * 12);

  const pointsBuffer = createBuffer(
    device,
    GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    pointData,
  );
  const nodesBuffer = createBuffer(
    device,
    GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    nodeData,
  );
  const outVerticesBuffer = device.createBuffer({
    size: MAX_NODES * 4 * OUT_VERTEX_STRIDE,
    usage: GPUBufferUsage.STORAGE,
  });
  const nodeCountBuffer = createBuffer(
    device,
    GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    nodeCountData,
  );

  const indexBuffer = createBuffer(
    device,
    GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
    new Uint8Array(indexData.buffer),
  );

  onCleanup(() => {
    pointsBuffer.destroy();
    nodesBuffer.destroy();
    outVerticesBuffer.destroy();
    nodeCountBuffer.destroy();
    indexBuffer.destroy();
  });

  const renderCode = await (
    await fetch(new URL("./line.wgsl", import.meta.url))
  ).text();

  const renderBindGroupLayout = device.createBindGroupLayout({
    entries: [
      {
        binding: 0,
        visibility: GPUShaderStage.VERTEX,
        buffer: { type: "read-only-storage" },
      },
    ],
  });

  const { pipeline, pickPipeline } = await createLayerPipelines({
    context,
    bindGroupLayout: renderBindGroupLayout,
    code: renderCode,
  });

  const renderBindGroup = device.createBindGroup({
    layout: renderBindGroupLayout,
    entries: [{ binding: 0, resource: { buffer: outVerticesBuffer } }],
  });

  const commonCode = await (
    await fetch(new URL("../common.wgsl", import.meta.url))
  ).text();
  const computeCode = await (
    await fetch(new URL("./compute.wgsl", import.meta.url))
  ).text();
  const computeModule = device.createShaderModule({
    code: commonCode + computeCode,
  });

  const computeBindGroupLayout = device.createBindGroupLayout({
    entries: [
      {
        binding: 0,
        visibility: GPUShaderStage.COMPUTE,
        buffer: { type: "read-only-storage" },
      },
      {
        binding: 1,
        visibility: GPUShaderStage.COMPUTE,
        buffer: { type: "read-only-storage" },
      },
      {
        binding: 2,
        visibility: GPUShaderStage.COMPUTE,
        buffer: { type: "storage" },
      },
      {
        binding: 3,
        visibility: GPUShaderStage.COMPUTE,
        buffer: { type: "uniform" },
      },
    ],
  });

  const computePipeline = await device.createComputePipelineAsync({
    layout: device.createPipelineLayout({
      bindGroupLayouts: [viewLayout(device), computeBindGroupLayout],
    }),
    compute: { module: computeModule, entryPoint: "main" },
  });

  const computeBindGroup = device.createBindGroup({
    layout: computeBindGroupLayout,
    entries: [
      { binding: 0, resource: { buffer: pointsBuffer } },
      { binding: 1, resource: { buffer: nodesBuffer } },
      { binding: 2, resource: { buffer: outVerticesBuffer } },
      { binding: 3, resource: { buffer: nodeCountBuffer } },
    ],
  });

  let pointCount = 0;
  let nodeCount = 0;
  let indexCount = 0;
  let dirty = false;
  const linePickIds: number[] = [];

  effect(() => {
    const list = resolve(lines);

    let pi = 0;
    let ni = 0;
    let ii = 0;

    for (let li = 0; li < list.length; li++) {
      const pts = list[li]?.points;
      if (!pts || pts.length < 2) continue;

      let pickId = linePickIds[li];
      if (pickId === undefined) {
        pickId = pickRegistry.allocate();
        linePickIds[li] = pickId;
      }
      const startIndex = pi;

      for (const point of pts) {
        if (pi >= MAX_POINTS) break;
        const { position, color, width } = point;
        const offset = pi * POINT_STRIDE;
        positionData(position, pointData.subarray(offset));
        const view = new DataView(pointData.buffer, offset);
        view.setFloat32(12, width, true);
        colorData(color, pointData.subarray(offset + 16));
        pi++;
      }

      const written = pi - startIndex;
      if (written < 2) continue;

      const nodeStart = ni;
      for (let k = 0; k < written; k++) {
        if (ni >= MAX_NODES) break;
        const offset = ni * NODE_STRIDE;
        const view = new DataView(nodeData.buffer, offset);
        const prev = startIndex + Math.max(0, k - 1);
        const current = startIndex + k;
        const next = startIndex + Math.min(written - 1, k + 1);
        view.setUint32(0, prev, true);
        view.setUint32(4, current, true);
        view.setUint32(8, next, true);
        view.setUint32(12, pickId, true);
        ni++;
      }

      const nodeWritten = ni - nodeStart;
      const quadCount = Math.max(0, 2 * nodeWritten - 1);
      const vertexStart = nodeStart * 4;
      for (let k = 0; k < quadCount; k++) {
        if (ii + 6 > indexData.length) break;
        const a = vertexStart + k * 2;
        const b = a + 1;
        const c = a + 2;
        const d = a + 3;
        indexData[ii++] = a;
        indexData[ii++] = c;
        indexData[ii++] = b;
        indexData[ii++] = b;
        indexData[ii++] = c;
        indexData[ii++] = d;
      }
    }

    pointCount = pi;
    nodeCount = ni;
    indexCount = ii;
    nodeCountData[0] = nodeCount;
    dirty = true;
  });

  const update = () => {
    if (!dirty) return;
    if (pointCount > 0)
      device.queue.writeBuffer(
        pointsBuffer,
        0,
        pointData,
        0,
        pointCount * POINT_STRIDE,
      );
    if (nodeCount > 0)
      device.queue.writeBuffer(
        nodesBuffer,
        0,
        nodeData,
        0,
        nodeCount * NODE_STRIDE,
      );
    if (indexCount > 0)
      device.queue.writeBuffer(indexBuffer, 0, indexData, 0, indexCount);
    device.queue.writeBuffer(nodeCountBuffer, 0, nodeCountData);
    dirty = false;
  };

  const compute = (pass: GPUComputePassEncoder) => {
    if (nodeCount === 0) return;
    pass.setPipeline(computePipeline);
    pass.setBindGroup(1, computeBindGroup);
    pass.dispatchWorkgroups(Math.ceil(nodeCount / 64));
  };

  const render = (
    pass: GPURenderPassEncoder,
    { pick }: { pick?: boolean } = {},
  ) => {
    if (indexCount === 0) return;
    pass.setPipeline(pick ? pickPipeline : pipeline);
    pass.setBindGroup(1, renderBindGroup);
    pass.setIndexBuffer(indexBuffer, "uint32");
    pass.drawIndexed(indexCount);
  };

  return { compute, update, render };
});
