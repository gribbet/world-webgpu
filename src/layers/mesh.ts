import { createLayerType } from "../common";
import { createBuffer } from "../device";
import type { Vec2, Vec3, Vec4 } from "../model";
import {
  createSignal,
  derived,
  effect,
  onCleanup,
  type Properties,
  resolve,
} from "../reactive";
import { array, f32, position, struct, u32, vec4f } from "../storage";
import { createLayerPipelines } from "./common";

const instanceStruct = struct({
  position: position(),
  orientation: vec4f(),
  scale: f32(),
  minScalePixels: f32(),
  maxScalePixels: f32(),
  color: vec4f(),
  pickId: u32(),
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

export type Instance = {
  position: Vec3;
  orientation?: Vec4;
  scale?: number;
  minScalePixels?: number;
  maxScalePixels?: number;
  color?: Vec4;
};

export type MeshProps = {
  mesh: Mesh;
  instances: Properties<Instance>[];
};

export const mesh = createLayerType<MeshProps>(
  async (context, { mesh, instances }) => {
    const { device, pickRegistry } = context;

    const storage = array(instanceStruct, device, {
      usage: GPUBufferUsage.STORAGE,
      initialCapacity: 1024,
    });

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

    const bindGroup = derived(() =>
      device.createBindGroup({
        layout: bindGroupLayout,
        entries: [{ binding: 0, resource: { buffer: storage.buffer() } }],
      }),
    );

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

    let count = 0;
    effect(() => {
      const list = resolve(instances);
      count = list.length;
      storage.resize(count);

      for (let i = 0; i < count; i++) {
        const instance = list[i];
        if (!instance) continue;

        const item = storage.items[i];
        if (!item) continue;

        const {
          position,
          orientation,
          scale,
          minScalePixels,
          maxScalePixels,
          color,
        } = instance;
        item.pickId = pickRegistry.allocate();

        effect(() => void (item.position = resolve(position)));
        effect(
          () => void (item.orientation = resolve(orientation) ?? [0, 0, 0, 1]),
        );
        effect(() => {
          item.scale = resolve(scale) ?? 1;
          item.minScalePixels = resolve(minScalePixels) ?? -1;
          item.maxScalePixels = resolve(maxScalePixels) ?? -1;
        });
        effect(() => void (item.color = resolve(color) ?? [1, 1, 1, 1]));
      }
    });

    const update = () => storage.flush();

    const render = (
      pass: GPURenderPassEncoder,
      { pick }: { pick?: boolean } = {},
    ) => {
      const buffers = meshBuffers();
      if (count === 0 || !buffers) return;
      pass.setPipeline(pick ? pickPipeline : pipeline);
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
