import { createDataBuffer, createResizableBuffer } from "../../buffer";
import { createLayerType, viewLayout } from "../../common";
import type { Vec3, Vec4 } from "../../model";
import type { PickHandlers } from "../../pick-registry";
import type { Properties } from "../../reactive";
import { derived, effect, resolve } from "../../reactive";
import { f32, position, struct, structArray, u32, vec4f } from "../../storage";
import { createLayerPipelines } from "../common";

export type LinePoint = {
  position: Vec3;
  color: Vec4;
  width: number;
};

export type Line = PickHandlers & {
  points: Properties<LinePoint>[];
};

export type LineProps = {
  lines: Properties<Line>[];
};

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

  const indexBuffer = createResizableBuffer(
    device,
    GPUBufferUsage.STORAGE | GPUBufferUsage.INDEX,
    1024 * 12 * 4,
  );

  const ensureIndexCapacity = (requiredNodes: number) => {
    indexBuffer.ensureSize(requiredNodes * 12 * 4);
  };
  const nodeCountData = new Uint32Array(1);
  const nodeCountBuffer = createDataBuffer(
    device,
    GPUBufferUsage.UNIFORM,
    nodeCountData,
  );

  const renderCode = await (
    await fetch(new URL("./render.wgsl", import.meta.url))
  ).text();

  const renderBindGroupLayout = device.createBindGroupLayout({
    entries: [
      {
        binding: 0,
        visibility: GPUShaderStage.VERTEX,
        buffer: { type: "read-only-storage" },
      },
      {
        binding: 1,
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
        { binding: 0, resource: { buffer: pointsStorage.buffer() } },
        { binding: 1, resource: { buffer: nodesStorage.buffer() } },
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
        buffer: { type: "uniform" },
      },
      {
        binding: 2,
        visibility: GPUShaderStage.COMPUTE,
        buffer: { type: "storage" },
      },
    ],
  });

  const computePipeline = await device.createComputePipelineAsync({
    layout: device.createPipelineLayout({
      bindGroupLayouts: [viewLayout(device), computeBindGroupLayout],
    }),
    compute: { module: computeModule, entryPoint: "generateIndices" },
  });

  const computeBindGroup = derived(() =>
    device.createBindGroup({
      layout: computeBindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: nodesStorage.buffer() } },
        { binding: 1, resource: { buffer: nodeCountBuffer } },
        { binding: 2, resource: { buffer: indexBuffer.buffer() } },
      ],
    }),
  );

  let nodeCount = 0;
  let indexCount = 0;
  let pointsDirty = false;
  let nodesDirty = false;
  let indicesDirty = false;
  let topologyKey = "";

  effect(() => {
    const list = resolve(lines);
    const resolved = list.map(props => ({
      props,
      points: resolve(props.points),
    }));
    const nextTopologyKey = resolved
      .map(({ points }) => points.length)
      .join(",");
    const topologyChanged = nextTopologyKey !== topologyKey;
    topologyKey = nextTopologyKey;

    let pointCount = 0;
    for (const { points } of resolved) pointCount += points.length;
    pointsStorage.resize(pointCount);

    let pi = 0;
    for (const { points } of resolved)
      for (const point of points) {
        const item = pointsStorage.items[pi];
        if (!item) continue;
        item.position = resolve(point.position);
        item.width = resolve(point.width);
        item.color = resolve(point.color);
        pi++;
      }

    pointsDirty = true;

    if (!topologyChanged) return;

    let ni = 0;
    let startIndex = 0;
    for (const { props, points } of resolved) {
      const written = points.length;
      if (written < 2) {
        startIndex += written;
        continue;
      }

      const pickId = pickRegistry.allocate(props);
      for (let k = 0; k < written; k++) {
        nodesStorage.resize(ni + 1);
        const item = nodesStorage.items[ni];
        if (!item) continue;
        item.prev = startIndex + Math.max(0, k - 1);
        item.current = startIndex + k;
        item.next = startIndex + Math.min(written - 1, k + 1);
        item.pickId = pickId;
        ni++;
      }

      startIndex += written;
    }

    nodeCount = ni;
    // The compute index pass writes 2 quads (12 indices) per node. At line ends,
    // bridge quads are emitted as degenerates, so drawing nodeCount*12 is safe.
    indexCount = nodeCount * 12;
    ensureIndexCapacity(nodeCount);
    nodeCountData[0] = nodeCount;
    nodesDirty = true;
    indicesDirty = true;
  });

  const update = () => {
    if (!pointsDirty && !nodesDirty) return;
    if (pointsDirty) {
      pointsStorage.flush();
      pointsDirty = false;
    }
    if (nodesDirty) {
      nodesStorage.flush();
      device.queue.writeBuffer(nodeCountBuffer, 0, nodeCountData);
      nodesDirty = false;
    }
  };

  const compute = (pass: GPUComputePassEncoder) => {
    if (nodeCount === 0 || !indicesDirty) return;
    pass.setPipeline(computePipeline);
    pass.setBindGroup(1, computeBindGroup());
    pass.dispatchWorkgroups(Math.ceil(nodeCount / 64));
    indicesDirty = false;
  };

  const render = (
    pass: GPURenderPassEncoder,
    { pick }: { pick?: boolean } = {},
  ) => {
    if (indexCount === 0) return;
    pass.setPipeline(pick ? pickPipeline : pipeline);
    pass.setBindGroup(1, renderBindGroup());
    pass.setIndexBuffer(indexBuffer.buffer(), "uint32");
    pass.drawIndexed(indexCount);
  };

  return { compute, update, render };
});
