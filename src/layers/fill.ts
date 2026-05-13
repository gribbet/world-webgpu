import { createLayerType } from "../common";
import type { Vec3, Vec4 } from "../model";
import type { PickHandlers } from "../pick-registry";
import { derived, effect, resolve } from "../reactive";
import { array, position, struct, structArray, u32, vec4f } from "../storage";
import { createLayerPipelines } from "./common";

export type Vertex = {
  position: Vec3;
  color: Vec4;
};

export type FillProps = PickHandlers & {
  vertices: Vertex[];
  indices: number[];
};

const vertexStruct = struct({
  position: position(),
  color: vec4f(),
  pickId: u32(),
});

export const fill = createLayerType<FillProps>(async (context, props) => {
  const { vertices, indices } = props;
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

  const pickId = pickRegistry.allocate(props);

  let indexCount = 0;

  effect(() => {
    const _vertices = resolve(vertices);
    const _indices = resolve(indices);
    indexCount = _indices.length;

    storage.resize(_vertices.length);
    storage.items.forEach((item, i) => {
      const v = _vertices[i];
      if (!v) return;
      item.position = v.position;
      item.color = v.color;
      item.pickId = pickId;
    });

    indexStorage.resize(_indices.length);
    _indices.forEach((v, i) => {
      indexStorage.items[i] = v;
    });
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
});
