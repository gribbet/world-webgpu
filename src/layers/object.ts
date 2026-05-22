import {
  derived,
  effect,
  map,
  onCleanup,
  type Properties,
  resolve,
  signal,
} from "signals.ts";

import { createDataBuffer } from "../buffer";
import { createLayerType } from "../common";
import type { Vec2, Vec3, Vec4 } from "../model";
import type { PickHandlers } from "../pick-registry";
import {
  createSlotAllocator,
  f32,
  position,
  struct,
  u32,
  vec4f,
} from "../storage";
import { type CommonLayerProps, createLayerPipelines } from "./common";

const instanceStruct = struct({
  position: position(),
  orientation: vec4f(),
  scale: f32(),
  minScalePixels: f32(),
  maxScalePixels: f32(),
  color: vec4f(),
  pickId: u32(),
  diffuse: vec4f(),
});

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

export type Instance = PickHandlers & {
  position: Vec3;
  orientation?: Vec4;
  scale?: number;
  minScalePixels?: number;
  maxScalePixels?: number;
  color?: Vec4;
  diffuse?: Vec4;
};

export type ObjectProps = CommonLayerProps & {
  mesh: Mesh;
  instances: Properties<Instance>[];
};

export const object = createLayerType<ObjectProps>(
  async (context, { mesh, instances, depth, polygonOffset }) => {
    const { device, pickRegistry } = context;

    const slots = createSlotAllocator(instanceStruct, device, {
      usage: GPUBufferUsage.STORAGE,
      initialCapacity: 16,
    });

    const code = await (
      await fetch(new URL("./object.wgsl", import.meta.url))
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
      depth,
      polygonOffset,
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

    const bindGroup = derived(() =>
      device.createBindGroup({
        layout: bindGroupLayout,
        entries: [{ binding: 0, resource: { buffer: slots.buffer() } }],
      }),
    );

    type MeshBuffers = {
      vertex: GPUBuffer;
      indices: GPUBuffer;
      indexCount: number;
    };
    const [meshBuffers, setMeshBuffers] = signal<MeshBuffers | undefined>(
      undefined,
    );

    effect(() => {
      const _mesh = resolve(mesh);
      const vertexData = new Float32Array(_mesh.vertices.length * 12);
      _mesh.vertices.forEach((v, i) => {
        const offset = i * 12;
        vertexData.set(v.position, offset);
        vertexData.set(v.color ?? [1, 1, 1, 1], offset + 3);
        vertexData.set(v.uv ?? [0, 0], offset + 7);
        vertexData.set(v.normal ?? [0, 0, 1], offset + 9);
      });

      const vertex = createDataBuffer(
        device,
        GPUBufferUsage.VERTEX,
        vertexData,
      );
      const indicesData = new Uint32Array(_mesh.indices.flat());
      const indices = createDataBuffer(
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
    });

    map(instances, instance => {
      const [item, release] = slots.allocate();
      onCleanup(release);

      const {
        position,
        orientation,
        scale,
        minScalePixels,
        maxScalePixels,
        color,
        diffuse,
      } = instance;
      const pickId = pickRegistry.allocate(instance);
      effect(() => {
        item.pickId = pickId();
      });
      effect(() => {
        item.position = resolve(position);
      });
      effect(() => {
        item.orientation = resolve(orientation) ?? [0, 0, 0, 1];
      });
      effect(() => {
        item.scale = resolve(scale) ?? 1;
        item.minScalePixels = resolve(minScalePixels) ?? -1;
        item.maxScalePixels = resolve(maxScalePixels) ?? -1;
      });
      effect(() => {
        item.color = resolve(color) ?? [1, 1, 1, 1];
      });
      effect(() => {
        item.diffuse = resolve(diffuse) ?? [1, 1, 1, 1];
      });
    });

    const update = () => slots.flush();

    const render = (
      pass: GPURenderPassEncoder,
      { pick }: { pick?: boolean } = {},
    ) => {
      const buffers = meshBuffers();
      const count = slots.count();
      if (count === 0 || !buffers) return;
      pass.setPipeline(pick ? pickPipeline() : pipeline());
      pass.setBindGroup(1, bindGroup());
      pass.setVertexBuffer(0, buffers.vertex);
      pass.setIndexBuffer(buffers.indices, "uint32");
      pass.drawIndexed(buffers.indexCount, count);
    };

    return {
      update,
      render,
    };
  },
);
