import { createLayerType, viewLayout } from "../../common";
import { createBuffer } from "../../device";
import { createResizableBuffer } from "../../device";
import type { Vec3, Vec4 } from "../../model";
import { derived, effect, resolve } from "../../reactive";
import {
  array,
  f32,
  position,
  struct,
  structArray,
  u32,
  vec4f,
} from "../../storage";
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

const OUT_VERTEX_STRIDE = 64; // 4 x vec4

const pointStruct = struct({
  position: position(),
  width: f32(),
  color: vec4f(),
});

const nodeStruct = struct({
  prev: u32(),
  current: u32(),
  next: u32(),
  pickId: u32(),
});

export const line = createLayerType<LineProps>(async (context, { lines }) => {
  const { device, pickRegistry } = context;

  const pointsStorage = structArray(pointStruct, device, {
    usage: GPUBufferUsage.STORAGE,
    initialCapacity: 1024,
  });
  const nodesStorage = structArray(nodeStruct, device, {
    usage: GPUBufferUsage.STORAGE,
    initialCapacity: 1024,
  });
  const outVerticesBuffer = createResizableBuffer(
    device,
    GPUBufferUsage.STORAGE,
    1024 * 4 * OUT_VERTEX_STRIDE,
  );

  const ensureOutVerticesCapacity = (requiredNodes: number) => {
    outVerticesBuffer.ensureSize(requiredNodes * 4 * OUT_VERTEX_STRIDE);
  };
  const nodeCountData = new Uint32Array(1);
  const nodeCountBuffer = createBuffer(
    device,
    GPUBufferUsage.UNIFORM,
    nodeCountData,
  );

  const indexStorage = array(u32(), device, {
    usage: GPUBufferUsage.INDEX,
    initialCapacity: 4096,
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

  const renderBindGroup = derived(() =>
    device.createBindGroup({
      layout: renderBindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: outVerticesBuffer.buffer() } },
      ],
    }),
  );

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

  const computeBindGroup = derived(() =>
    device.createBindGroup({
      layout: computeBindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: pointsStorage.buffer() } },
        { binding: 1, resource: { buffer: nodesStorage.buffer() } },
        { binding: 2, resource: { buffer: outVerticesBuffer.buffer() } },
        { binding: 3, resource: { buffer: nodeCountBuffer } },
      ],
    }),
  );

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
        const { position, color, width } = point;
        pointsStorage.resize(pi + 1);
        const item = pointsStorage.items[pi];
        if (!item) continue;
        item.position = position;
        item.width = width;
        item.color = color;
        pi++;
      }

      const written = pi - startIndex;
      if (written < 2) continue;

      const nodeStart = ni;
      for (let k = 0; k < written; k++) {
        const prev = startIndex + Math.max(0, k - 1);
        const current = startIndex + k;
        const next = startIndex + Math.min(written - 1, k + 1);
        nodesStorage.resize(ni + 1);
        const item = nodesStorage.items[ni];
        if (!item) continue;
        item.prev = prev;
        item.current = current;
        item.next = next;
        item.pickId = pickId;
        ni++;
      }

      const nodeWritten = ni - nodeStart;
      const quadCount = Math.max(0, 2 * nodeWritten - 1);
      const vertexStart = nodeStart * 4;
      for (let k = 0; k < quadCount; k++) {
        const a = vertexStart + k * 2;
        const b = a + 1;
        const c = a + 2;
        const d = a + 3;
        indexStorage.resize(ii + 6);
        indexStorage.items[ii++] = a;
        indexStorage.items[ii++] = c;
        indexStorage.items[ii++] = b;
        indexStorage.items[ii++] = b;
        indexStorage.items[ii++] = c;
        indexStorage.items[ii++] = d;
      }
    }

    nodeCount = ni;
    indexCount = ii;
    ensureOutVerticesCapacity(nodeCount);
    nodeCountData[0] = nodeCount;
    dirty = true;
  });

  const update = () => {
    if (!dirty) return;
    pointsStorage.flush();
    nodesStorage.flush();
    indexStorage.flush();
    device.queue.writeBuffer(nodeCountBuffer, 0, nodeCountData);
    dirty = false;
  };

  const compute = (pass: GPUComputePassEncoder) => {
    if (nodeCount === 0) return;
    pass.setPipeline(computePipeline);
    pass.setBindGroup(1, computeBindGroup());
    pass.dispatchWorkgroups(Math.ceil(nodeCount / 64));
  };

  const render = (
    pass: GPURenderPassEncoder,
    { pick }: { pick?: boolean } = {},
  ) => {
    if (indexCount === 0) return;
    pass.setPipeline(pick ? pickPipeline : pipeline);
    pass.setBindGroup(1, renderBindGroup());
    pass.setIndexBuffer(indexStorage.buffer(), "uint32");
    pass.drawIndexed(indexCount);
  };

  return { compute, update, render };
});
