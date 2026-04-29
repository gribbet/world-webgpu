import { createLayerType } from "../common";
import type { Vec3, Vec4 } from "../model";
import {
  createSignal,
  derived,
  effect,
  onCleanup,
  type Properties,
  resolve,
} from "../reactive";
import { array, f32, i32, position, struct, u32, vec4f } from "../storage";
import { createTextureGroup } from "../texture-group";
import { createLayerPipelines } from "./common";

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

export type Billboard = {
  image: string;
  size: number;
  position: Vec3;
  color?: Vec4;
  minScale?: number;
  maxScale?: number;
};

export type BillboardProps = {
  billboards: Properties<Billboard>[];
};

export const billboard = createLayerType<BillboardProps>(
  async (context, { billboards }) => {
    const { device, pickRegistry } = context;

    const storage = array(billboardStruct, device, {
      usage: GPUBufferUsage.STORAGE,
      initialCapacity: 1024,
    });
    onCleanup(() => storage.destroy());

    const [imageMetadata, setImageMetadata] = createSignal<{
      [url: string]:
        | { index: number; width: number; height: number }
        | undefined;
    }>({});

    const textureGroup = createTextureGroup({
      context,
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
      maxAnisotropy: 16,
    });

    const { pipeline, pickPipeline } = await createLayerPipelines({
      context,
      code,
      topology: "triangle-strip",
      bindGroupLayout,
    });

    const bindGroup = derived(() =>
      device.createBindGroup({
        layout: bindGroupLayout,
        entries: [
          { binding: 0, resource: { buffer: storage.buffer() } },
          { binding: 1, resource: textureGroup.texture().createView() },
          { binding: 2, resource: sampler },
        ],
      }),
    );

    let count = 0;
    effect(() => {
      const list = resolve(billboards);
      count = list.length;
      storage.setCount(count);

      for (let i = 0; i < count; i++) {
        const billboard = list[i];
        if (!billboard) continue;

        const item = storage.items[i];
        if (!item) continue;
        const { position, color, image, size, minScale, maxScale } = billboard;

        const metadata = derived(() => imageMetadata()[resolve(image)]);
        const pickId = pickRegistry.allocate();
        effect(() => {
          const data = metadata();
          item.texture = data?.index ?? -1;
          item.width = data?.width ?? 0;
          item.height = data?.height ?? 0;
          item.pickId = pickId;
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
      }
    });

    const update = () => {
      textureGroup.ensure(
        resolve(billboards)
          .map(_ => resolve(_.image))
          .filter(_ => !!_),
      );
      storage.flush();
    };

    const render = (
      pass: GPURenderPassEncoder,
      { pick }: { pick?: boolean } = {},
    ) => {
      if (count === 0) return;
      pass.setPipeline(pick ? pickPipeline : pipeline);
      pass.setBindGroup(1, bindGroup());
      pass.draw(4, count, 0, 0);
    };

    return {
      update,
      render,
    };
  },
);
