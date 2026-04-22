import { colorData, positionData } from "../common";
import type { Context } from "../context";
import { createBuffer } from "../device";
import type { Vec2, Vec3, Vec4 } from "../model";
import {
  createSignal,
  effect,
  onCleanup,
  type Properties,
  resolve,
} from "../reactive";
import { createLayerPipelines } from "./common";

export type Vertex = {
  position: Vec3;
  color?: Vec4;
  uv?: Vec2;
  normal?: Vec3;
};

export type Mesh = {
  vertices: Vertex[];
  indices: Vec3[];
};

export type Instance = {
  position: Vec3;
  orientation?: Vec4;
  scale?: number;
  color?: Vec4;
};

export type MeshProps = {
  mesh: Mesh;
  instances: Properties<Instance>[];
};

export const createMeshLayer = async (
  context: Context,
  { mesh, instances }: Properties<MeshProps>,
) => {
  const { device, pickRegistry } = context;

  const maxInstances = 10000;
  const stride = 80;
  const instanceData = new Uint8Array(maxInstances * stride);
  const instancesBuffer = createBuffer(
    device,
    GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    instanceData,
  );

  const code = await (
    await fetch(new URL("./mesh.wgsl", import.meta.url))
  ).text();

  const bindGroupLayout = device.createBindGroupLayout({
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
    code,
    topology: "triangle-list",
    bindGroupLayout,
    buffers: [
      {
        arrayStride: 48,
        attributes: [
          { shaderLocation: 0, offset: 0, format: "float32x3" },
          { shaderLocation: 1, offset: 12, format: "float32x4" },
          { shaderLocation: 2, offset: 28, format: "float32x2" },
          { shaderLocation: 3, offset: 36, format: "float32x3" },
        ],
      },
    ],
  });

  const bindGroup = device.createBindGroup({
    layout: bindGroupLayout,
    entries: [{ binding: 0, resource: { buffer: instancesBuffer } }],
  });

  type MeshBuffers = {
    vertex: GPUBuffer;
    indices: GPUBuffer;
    indexCount: number;
  };
  const [meshBuffers, setMeshBuffers] = createSignal<MeshBuffers | undefined>(
    undefined,
  );

  effect(() => {
    const mesh_ = resolve(mesh);
    const vertexData = new Float32Array(mesh_.vertices.length * 12);
    mesh_.vertices.forEach((v, i) => {
      const offset = i * 12;
      vertexData.set(v.position, offset);
      vertexData.set(v.color ?? [1, 1, 1, 1], offset + 3);
      vertexData.set(v.uv ?? [0, 0], offset + 7);
      vertexData.set(v.normal ?? [0, 0, 1], offset + 9);
    });

    const vertex = createBuffer(device, GPUBufferUsage.VERTEX, vertexData);
    const indicesData = new Uint32Array(mesh_.indices.flat());
    const indices = createBuffer(
      device,
      GPUBufferUsage.INDEX,
      new Uint8Array(
        indicesData.buffer,
        indicesData.byteOffset,
        indicesData.byteLength,
      ),
    );
    setMeshBuffers({
      vertex,
      indices,
      indexCount: indicesData.length,
    });
    onCleanup(() => {
      vertex.destroy();
      indices.destroy();
    });
  });

  onCleanup(() => instancesBuffer.destroy());

  let count = 0;
  let dirty = false;
  effect(() => {
    const list = resolve(instances);
    count = Math.min(list.length, maxInstances);

    for (let i = 0; i < count; i++) {
      const instance = list[i];
      if (!instance) continue;

      const offset = i * stride;
      const { position, orientation, scale, color } = instance;

      const pickId = pickRegistry.allocate();
      const view = new DataView(instanceData.buffer, offset);
      view.setUint32(64, pickId, true);

      effect(() => {
        positionData(resolve(position), instanceData.subarray(offset));
        dirty = true;
      });
      effect(() => {
        const view = new DataView(instanceData.buffer, offset);
        const [x, y, z, w] = resolve(orientation) ?? [0, 0, 0, 1];
        view.setFloat32(16, x, true);
        view.setFloat32(20, y, true);
        view.setFloat32(24, z, true);
        view.setFloat32(28, w, true);
        dirty = true;
      });
      effect(() => {
        const view = new DataView(instanceData.buffer, offset);
        const s = resolve(scale) ?? 1;
        view.setFloat32(32, s, true);
        view.setFloat32(36, s, true);
        view.setFloat32(40, s, true);
        dirty = true;
      });
      effect(() => {
        colorData(
          resolve(color) ?? [1, 1, 1, 1],
          instanceData.subarray(offset + 48),
        );
        dirty = true;
      });
    }
  });

  const update = () => {
    if (count > 0 && dirty)
      device.queue.writeBuffer(
        instancesBuffer,
        0,
        instanceData,
        0,
        count * stride,
      );
    dirty = false;
  };

  const render = (
    pass: GPURenderPassEncoder,
    { pick }: { pick?: boolean } = {},
  ) => {
    const buffers = meshBuffers();
    if (count === 0 || !buffers) return;
    pass.setPipeline(pick ? pickPipeline : pipeline);
    pass.setBindGroup(1, bindGroup);
    pass.setVertexBuffer(0, buffers.vertex);
    pass.setIndexBuffer(buffers.indices, "uint32");
    pass.drawIndexed(buffers.indexCount, Math.min(count, maxInstances));
  };

  return {
    update,
    render,
  };
};
