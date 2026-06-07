import { derived, effect, resolve } from "signals.ts";

import { createLayerType } from "../common";
import type { Vec3, Vec4 } from "../model";
import type { PickHandlers } from "../pick-registry";
import { array, buffer, position, struct, u32, vec4f } from "../storage";
import { type CommonLayerProps, createLayerRenderer } from "./common";

export type Vertex = {
  position: Vec3;
  color: Vec4;
};

export type FillProps = PickHandlers &
  CommonLayerProps & {
    vertices: Vertex[];
    indices: number[];
  };

export const fill = createLayerType<FillProps>(async (context, props) => {
  const { vertices, indices, depth, polygonOffset, outline } = props;
  const { device, pickRegistry } = context;

  const storage = buffer(
    array(
      struct({
        position: position(),
        color: vec4f(),
        pickId: u32(),
        outline: vec4f(),
      }),
    ),
    device,
    {
      usage: GPUBufferUsage.STORAGE,
      initialCapacity: 1024,
    },
  );
  const indexStorage = buffer(array(u32()), device, {
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

  const bindGroup = derived(() =>
    device.createBindGroup({
      layout: bindGroupLayout,
      entries: [{ binding: 0, resource: { buffer: storage.buffer() } }],
    }),
  );

  const { render, pick } = await createLayerRenderer({
    context,
    bindGroupLayout,
    code,
    depth,
    polygonOffset,
    bindGroup,
    draw: pass => {
      if (indexCount === 0) return;
      pass.setIndexBuffer(indexStorage.buffer(), "uint32");
      pass.drawIndexed(indexCount);
    },
  });

  const pickId = pickRegistry.allocate(props);

  let indexCount = 0;

  effect(() => {
    const _vertices = resolve(vertices);
    const _indices = resolve(indices);
    const _outline = resolve(outline) ?? [0, 0, 0, 0];
    indexCount = _indices.length;

    storage.value.resize(_vertices.length);
    storage.value.items.forEach((item, i) => {
      const v = _vertices[i];
      if (!v) return;
      item.position = v.position;
      item.color = v.color;
      item.pickId = pickId();
      item.outline = _outline;
    });

    indexStorage.value.resize(_indices.length);
    _indices.forEach((v, i) => {
      indexStorage.value.items[i] = v;
    });
  });

  const update = () => {
    storage.flush();
    indexStorage.flush();
  };

  return {
    update,
    render,
    pick,
  };
});
