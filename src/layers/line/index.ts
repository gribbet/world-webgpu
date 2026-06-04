import { derived, effect, resolve } from "signals.ts";

import { createLayerType } from "../../common";
import type { Vec3, Vec4 } from "../../model";
import type { PickHandlers } from "../../pick-registry";
import { f32, position, struct, structArray, u32, vec4f } from "../../storage";
import { type CommonLayerProps, createLayerRenderer } from "../common";

export type Vertex = {
  position: Vec3;
  color: Vec4;
  width: number;
  minWidthPixels?: number;
  maxWidthPixels?: number;
};

export type LineProps = PickHandlers &
  CommonLayerProps & {
    vertices: Vertex[][];
  };

const vertexStruct = struct({
  position: position(),
  width: f32(),
  color: vec4f(),
  minWidthPixels: f32(),
  maxWidthPixels: f32(),
  flags: u32(), // bit 0 = isFirst, bit 1 = isLast
  pickId: u32(),
});

export const line = createLayerType<LineProps>(async (context, props) => {
  const { vertices, depth, polygonOffset } = props;
  const { device, pickRegistry } = context;

  const storage = structArray(vertexStruct, device, {
    usage: GPUBufferUsage.STORAGE,
    initialCapacity: 1024,
  });

  const code = await (
    await fetch(new URL("./render.wgsl", import.meta.url))
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
    draw: pass => pass.draw(12, totalVertices),
  });

  const pickId = pickRegistry.allocate(props);
  let totalVertices = 0;

  effect(() => {
    const polylines = resolve(vertices);
    const id = pickId();

    let count = 0;
    for (const polyline of polylines) count += polyline.length;
    storage.resize(count);

    let vi = 0;
    for (const polyline of polylines) {
      const len = polyline.length;
      for (let k = 0; k < len; k++) {
        const v = polyline[k]!;
        const item = storage.items[vi];
        if (item) {
          item.position = v.position;
          item.width = v.width;
          item.color = v.color;
          item.minWidthPixels = v.minWidthPixels ?? 0;
          item.maxWidthPixels = v.maxWidthPixels ?? Infinity;
          item.flags = (k === 0 ? 1 : 0) | (k === len - 1 ? 2 : 0);
          item.pickId = id;
        }
        vi++;
      }
    }
    totalVertices = count;
  });

  const update = () => storage.flush();

  return { update, render, pick };
});
