import { colorData, positionData, viewLayout } from "../common";
import type { Context } from "../context";
import { createBuffer } from "../device";
import type { Vec3, Vec4 } from "../model";
import {
  createSignal,
  derived,
  effect,
  type Properties,
  resolve,
} from "../reactive";
import { createTextureGroup } from "../texture-group";

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

export const createBillboardLayer = async (
  context: Context,
  { billboards }: Properties<BillboardProps>,
) => {
  const { device, format, sampleCount } = context;

  const maxBillboards = 10000;
  const stride = 64;
  const billboardData = new Uint8Array(maxBillboards * stride);
  const billboardsBuffer = createBuffer(
    device,
    GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    billboardData,
  );

  const [imageMetadata, setImageMetadata] = createSignal<{
    [url: string]: { index: number; width: number; height: number } | undefined;
  }>({});

  const textureGroup = createTextureGroup({
    context,
    onLoad: (url, index, width, height) =>
      setImageMetadata({ ...imageMetadata(), [url]: { index, width, height } }),
    onEvict: url => setImageMetadata({ ...imageMetadata(), [url]: undefined }),
  });

  const module = device.createShaderModule({
    code:
      (await (await fetch(new URL("./common.wgsl", import.meta.url))).text()) +
      (await (
        await fetch(new URL("./billboard.wgsl", import.meta.url))
      ).text()),
  });

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

  const pipelineLayout = device.createPipelineLayout({
    bindGroupLayouts: [viewLayout(device), bindGroupLayout],
  });

  const pipeline = await device.createRenderPipelineAsync({
    layout: pipelineLayout,
    vertex: {
      module,
      entryPoint: "vertex",
    },
    fragment: {
      module,
      entryPoint: "render",
      targets: [
        {
          format,
          blend: {
            color: {
              srcFactor: "one",
              dstFactor: "one-minus-src-alpha",
            },
            alpha: {
              srcFactor: "one",
              dstFactor: "one-minus-src-alpha",
            },
          },
        },
      ],
    },
    primitive: {
      topology: "triangle-strip",
    },
    depthStencil: {
      format: "depth24plus",
      depthWriteEnabled: true,
      depthCompare: "less",
    },
    multisample: {
      count: sampleCount,
    },
  });

  const pickPipeline = await device.createRenderPipelineAsync({
    layout: pipelineLayout,
    vertex: {
      module,
      entryPoint: "vertex",
    },
    fragment: {
      module,
      entryPoint: "pick",
      targets: [{ format: "rgba32float" }],
    },
    primitive: {
      topology: "triangle-strip",
      cullMode: "none",
    },
    depthStencil: {
      format: "depth24plus",
      depthWriteEnabled: true,
      depthCompare: "less",
    },
    multisample: {
      count: 1,
    },
  });

  const bindGroup = derived(() =>
    device.createBindGroup({
      layout: bindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: billboardsBuffer } },
        { binding: 1, resource: textureGroup.texture().createView() },
        { binding: 2, resource: sampler },
      ],
    }),
  );

  let count = 0;
  let dirty = false;
  effect(() => {
    const list = resolve(billboards);
    count = Math.min(list.length, maxBillboards);

    for (let i = 0; i < count; i++) {
      const billboard = list[i];
      if (!billboard) continue;

      const offset = i * stride;
      const { position, color, image, size, minScale, maxScale } = billboard;

      const metadata = derived(() => imageMetadata()[resolve(image)]);
      effect(() => {
        const view = new DataView(billboardData.buffer, offset);
        const data = metadata();
        view.setInt32(32, data?.index ?? -1, true);
        view.setUint32(36, data?.width ?? 0, true);
        view.setUint32(40, data?.height ?? 0, true);
        dirty = true;
      });
      effect(() => {
        const view = new DataView(billboardData.buffer, offset);
        view.setFloat32(12, resolve(size), true);
        dirty = true;
      });
      effect(() => {
        positionData(resolve(position), billboardData.subarray(offset));
        dirty = true;
      });
      effect(() => {
        colorData(
          resolve(color) ?? [1, 1, 1, 1],
          billboardData.subarray(offset + 16),
        );
        dirty = true;
      });
      effect(() => {
        const view = new DataView(billboardData.buffer, offset);
        view.setFloat32(44, resolve(minScale) ?? -Infinity, true);
        view.setFloat32(48, resolve(maxScale) ?? Infinity, true);
        dirty = true;
      });
    }
  });

  return {
    update: () => {
      textureGroup.ensure(
        resolve(billboards)
          .map(_ => resolve(_.image))
          .filter(_ => !!_),
      );
      if (count > 0 && dirty)
        device.queue.writeBuffer(
          billboardsBuffer,
          0,
          billboardData,
          0,
          count * stride,
        );
      dirty = false;
    },
    render: (pass: GPURenderPassEncoder, { pick }: { pick?: boolean } = {}) => {
      if (count === 0) return;
      pass.setPipeline(pick ? pickPipeline : pipeline);
      pass.setBindGroup(1, bindGroup());
      pass.draw(4, Math.min(count, maxBillboards), 0, 0);
    },
  };
};
