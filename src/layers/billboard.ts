import {
  derived,
  effect,
  map,
  onCleanup,
  type Properties,
  resolve,
  signal,
} from "signals.ts";

import { createLayerType } from "../common";
import { loadImage } from "../image-load";
import type { Vec3, Vec4 } from "../model";
import type { PickHandlers } from "../pick-registry";
import {
  createSlotAllocator,
  f32,
  i32,
  position,
  struct,
  u32,
  vec4f,
} from "../storage";
import { createTextureGroup } from "../texture-group";
import { type CommonLayerProps, createLayerRenderer } from "./common";

const billboardStruct = struct({
  position: position(),
  size: f32(),
  color: vec4f(),
  texture: i32(),
  width: u32(),
  height: u32(),
  minScale: f32(),
  maxScale: f32(),
  pickId: u32(),
});

export type Billboard = PickHandlers & {
  image: string;
  size: number;
  position: Vec3;
  color?: Vec4;
  minScale?: number;
  maxScale?: number;
};

export type BillboardProps = CommonLayerProps & {
  billboards: Properties<Billboard>[];
};

export const billboard = createLayerType<BillboardProps>(
  async (context, { billboards, depth, polygonOffset }) => {
    const { device, pickRegistry } = context;

    const slots = createSlotAllocator(billboardStruct, device, {
      usage: GPUBufferUsage.STORAGE,
      initialCapacity: 16,
    });

    const [imageMetadata, setImageMetadata] = signal<{
      [url: string]:
        | { index: number; width: number; height: number }
        | undefined;
    }>({});

    const textureGroup = createTextureGroup({
      context,
      load: loadImage,
      onLoad: (url, index, width, height) =>
        setImageMetadata({
          ...imageMetadata(),
          [url]: { index, width, height },
        }),
      onEvict: url =>
        setImageMetadata({ ...imageMetadata(), [url]: undefined }),
    });

    const code = await (
      await fetch(new URL("./billboard.wgsl", import.meta.url))
    ).text();

    const bindGroupLayout = device.createBindGroupLayout({
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.VERTEX,
          buffer: { type: "read-only-storage" },
        },
        {
          binding: 1,
          visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
          texture: { viewDimension: "2d-array" },
        },
        {
          binding: 2,
          visibility: GPUShaderStage.FRAGMENT,
          sampler: { type: "filtering" },
        },
      ],
    });

    const sampler = device.createSampler({
      magFilter: "linear",
      minFilter: "linear",
      mipmapFilter: "linear",
      maxAnisotropy: 4,
    });

    const bindGroup = derived(() =>
      device.createBindGroup({
        layout: bindGroupLayout,
        entries: [
          { binding: 0, resource: { buffer: slots.buffer() } },
          { binding: 1, resource: textureGroup.texture().createView() },
          { binding: 2, resource: sampler },
        ],
      }),
    );

    const { render, pick } = await createLayerRenderer({
      context,
      code,
      topology: "triangle-strip",
      bindGroupLayout,
      depth,
      polygonOffset,
      bindGroup,
      draw: pass => {
        const count = slots.count();
        if (count === 0) return;
        pass.draw(4, count);
      },
    });

    map(billboards, billboard => {
      const [item, release] = slots.allocate();
      onCleanup(release);

      const { position, color, image, size, minScale, maxScale } = billboard;
      const metadata = derived(() => imageMetadata()[resolve(image)]);
      const pickId = pickRegistry.allocate(billboard);

      effect(() => {
        const data = metadata();
        item.texture = data?.index ?? -1;
        item.width = data?.width ?? 0;
        item.height = data?.height ?? 0;
      });
      effect(() => {
        item.pickId = pickId();
      });
      effect(() => {
        item.size = resolve(size);
      });
      effect(() => {
        item.position = resolve(position);
      });
      effect(() => {
        item.color = resolve(color) ?? [1, 1, 1, 1];
      });
      effect(() => {
        item.minScale = resolve(minScale) ?? -Infinity;
        item.maxScale = resolve(maxScale) ?? Infinity;
      });
    });

    const update = () => {
      textureGroup.ensure(
        resolve(billboards)
          .map(_ => resolve(_.image))
          .filter(_ => !!_),
      );
      slots.flush();
    };

    return {
      update,
      render,
      pick,
    };
  },
);
