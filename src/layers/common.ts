import { viewLayout } from "../common";
import type { Context } from "../context";

export const createLayerPipelines = async ({
  context,
  code,
  topology = "triangle-list",
  bindGroupLayout,
  buffers,
}: {
  context: Context;
  code: string;
  topology?: GPUPrimitiveTopology;
  bindGroupLayout: GPUBindGroupLayout;
  buffers?: GPUVertexBufferLayout[];
}) => {
  const { device, format, sampleCount } = context;

  const common = await (
    await fetch(new URL("./common.wgsl", import.meta.url))
  ).text();

  const module = device.createShaderModule({
    code: common + code,
  });

  const pipelineLayout = device.createPipelineLayout({
    bindGroupLayouts: [viewLayout(device), bindGroupLayout],
  });

  const descriptor = {
    layout: pipelineLayout,
    vertex: {
      module,
      entryPoint: "vertex",
      buffers,
    },
    primitive: {
      topology,
      cullMode: "back",
    },
    depthStencil: {
      format: "depth24plus",
      depthWriteEnabled: true,
      depthCompare: "less",
    },
  } satisfies GPURenderPipelineDescriptor;

  const pipeline = await device.createRenderPipelineAsync({
    ...descriptor,
    fragment: {
      module,
      entryPoint: "render",
      targets: [
        {
          format,
          blend: {
            color: { srcFactor: "one", dstFactor: "one-minus-src-alpha" },
            alpha: { srcFactor: "one", dstFactor: "one-minus-src-alpha" },
          },
        },
      ],
    },
    multisample: { count: sampleCount },
  });

  const pickPipeline = await device.createRenderPipelineAsync({
    ...descriptor,
    fragment: {
      module,
      entryPoint: "pick",
      targets: [{ format: "rgba32float" }, { format: "r32uint" }],
    },
    multisample: { count: 1 },
  });

  return { pipeline, pickPipeline };
};
