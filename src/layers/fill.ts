import { createLayerType } from "../common";
import type { Vec3, Vec4 } from "../model";
import { derived, effect, resolve } from "../reactive";
import { array, position, struct, structArray, u32, vec4f } from "../storage";
import { createLayerPipelines } from "./common";

export type Vertex = {
  position: Vec3;
  color: Vec4;
};

export type FillProps = {
  vertices: Vertex[];
  indices: number[];
};

const vertexStruct = struct({
  position: position(),
  color: vec4f(),
  pickId: u32(),
});

export const fill = createLayerType<FillProps>(
  async (context, { vertices, indices }) => {
    const { device, pickRegistry } = context;

    const storage = structArray(vertexStruct, device, {
      usage: GPUBufferUsage.STORAGE,
      initialCapacity: 1024,
    });
    const indexStorage = array(u32(), device, {
      usage: GPUBufferUsage.INDEX,
      initialCapacity: 1024,
    });

    const code = await (
      await fetch(new URL("./fill.wgsl", import.meta.url))
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
      bindGroupLayout,
      code,
    });

    const bindGroup = derived(() =>
      device.createBindGroup({
        layout: bindGroupLayout,
        entries: [{ binding: 0, resource: { buffer: storage.buffer() } }],
      }),
    );

    const pickId = pickRegistry.allocate();

    let vertexCount = 0;
    let indexCount = 0;

    effect(() => {
      const _vertices = resolve(vertices);
      const _indices = resolve(indices);
      vertexCount = _vertices.length;
      indexCount = _indices.length;

      storage.resize(vertexCount);
      indexStorage.resize(indexCount);

      for (let i = 0; i < vertexCount; i++) {
        const { position, color } = _vertices[i] ?? {};
        if (!position || !color) continue;
        const item = storage.items[i];
        if (!item) continue;
        item.position = position;
        item.color = color;
        item.pickId = pickId;
      }
      for (let i = 0; i < indexCount; i++)
        indexStorage.items[i] = _indices[i] ?? 0;
    });

    const update = () => {
      storage.flush();
      indexStorage.flush();
    };

    const render = (
      pass: GPURenderPassEncoder,
      { pick }: { pick?: boolean } = {},
    ) => {
      if (indexCount === 0) return;
      pass.setPipeline(pick ? pickPipeline : pipeline);
      pass.setBindGroup(1, bindGroup());
      pass.setIndexBuffer(indexStorage.buffer(), "uint32");
      pass.drawIndexed(indexCount);
    };

    return {
      update,
      render,
    };
  },
);
