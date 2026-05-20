import { derived, type Properties, resolve } from "signals.ts";

import { viewLayout } from "../common";
import type { Context } from "../context";

export type CommonLayerProps = {
  depth?: boolean;
  polygonOffset?: number;
};

export const createLayerPipelines = async ({
  context,
  code,
  topology = "triangle-list",
  bindGroupLayout,
  buffers,
  depth,
  polygonOffset,
}: {
  context: Context;
  code: string;
  topology?: GPUPrimitiveTopology;
  bindGroupLayout: GPUBindGroupLayout;
  buffers?: GPUVertexBufferLayout[];
} & Pick<Properties<CommonLayerProps>, "depth" | "polygonOffset">) => {
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

  const base = {
    layout: pipelineLayout,
    vertex: { module, entryPoint: "vertex", buffers },
    primitive: { topology },
  };

  const depthStencil = () => {
    const depthEnabled = resolve(depth) ?? true;
    return {
      format: "depth24plus" as const,
      depthWriteEnabled: depthEnabled,
      depthCompare: (depthEnabled ? "less" : "always") as GPUCompareFunction,
      depthBias: resolve(polygonOffset) ?? 0,
      depthBiasSlopeScale: 0,
      depthBiasClamp: 0,
    };
  };

  const pipeline = derived(() =>
    device.createRenderPipeline({
      ...base,
      depthStencil: depthStencil(),
      fragment: {
        module,
        entryPoint: "render",
        targets: [
          {
            format,
            blend: {
              color: {
                srcFactor: "src-alpha",
                dstFactor: "one-minus-src-alpha",
              },
              alpha: { srcFactor: "one", dstFactor: "one-minus-src-alpha" },
            },
          },
        ],
      },
      multisample: { count: sampleCount },
    }),
  );

  const pickPipeline = derived(() =>
    device.createRenderPipeline({
      ...base,
      depthStencil: { ...depthStencil(), depthWriteEnabled: true },
      fragment: {
        module,
        entryPoint: "pick",
        targets: [
          { format: "rg32uint" },
          { format: "r32float" },
          { format: "r32uint" },
        ],
      },
      multisample: { count: 1 },
    }),
  );

  return { pipeline, pickPipeline };
};
