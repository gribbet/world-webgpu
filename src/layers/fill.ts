import { createLayerType } from "../common";
import { createBuffer } from "../device";
import type { Vec3, Vec4 } from "../model";
import { derived, effect, resolve } from "../reactive";
import { array, position, struct, u32, vec4f } from "../storage";
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

    const maxIndices = 300000;
    const indexData = new Uint32Array(maxIndices);

    const storage = array(vertexStruct, device, {
      usage: GPUBufferUsage.STORAGE,
      initialCapacity: 1024,
    });
    const indexBuffer = createBuffer(
      device,
      GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
      new Uint8Array(indexData.buffer),
    );

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
    let indicesDirty = false;

    effect(() => {
      const _vertices = resolve(vertices);
      const _indices = resolve(indices);
      vertexCount = _vertices.length;
      indexCount = Math.min(_indices.length, maxIndices);

      storage.resize(vertexCount);

      for (let i = 0; i < vertexCount; i++) {
        const { position, color } = _vertices[i] ?? {};
        if (!position || !color) continue;
        const item = storage.items[i];
        if (!item) continue;
        item.position = position;
        item.color = color;
        item.pickId = pickId;
      }
      for (let i = 0; i < indexCount; i++) indexData[i] = _indices[i] ?? 0;

      indicesDirty = true;
    });

    const update = () => {
      storage.flush();
      if (!indicesDirty || indexCount === 0) return;
      device.queue.writeBuffer(
        indexBuffer,
        0,
        indexData.buffer,
        0,
        indexCount * 4,
      );
      indicesDirty = false;
    };

    const render = (
      pass: GPURenderPassEncoder,
      { pick }: { pick?: boolean } = {},
    ) => {
      if (indexCount === 0) return;
      pass.setPipeline(pick ? pickPipeline : pipeline);
      pass.setBindGroup(1, bindGroup());
      pass.setIndexBuffer(indexBuffer, "uint32");
      pass.drawIndexed(indexCount);
    };

    return {
      update,
      render,
    };
  },
);
