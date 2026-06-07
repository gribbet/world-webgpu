import type { Signal } from "signals.ts";
import { derived, type Properties, resolve } from "signals.ts";

import { viewLayout } from "../common";
import type { Context } from "../context";

export type CommonLayerProps = {
  depth?: boolean;
  polygonOffset?: number;
};

export const createLayerRenderer = async ({
  context,
  code,
  topology = "triangle-list",
  bindGroupLayout,
  buffers,
  constants,
  depth,
  polygonOffset,
  bindGroup,
  draw,
}: {
  context: Context;
  code: string;
  topology?: GPUPrimitiveTopology;
  bindGroupLayout: GPUBindGroupLayout;
  buffers?: GPUVertexBufferLayout[];
  constants?: Record<string, GPUPipelineConstantValue>;
  bindGroup: () => GPUBindGroup;
  draw: (pass: GPURenderPassEncoder) => void;
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

  const depthStencil = derived(() => {
    const depthEnabled = resolve(depth) ?? true;
    return {
      format: "depth24plus" as const,
      depthWriteEnabled: depthEnabled,
      depthCompare: depthEnabled ? "less" : "always",
      depthBias: resolve(polygonOffset) ?? 0,
    } satisfies GPUDepthStencilState;
  });

  const pipeline = derived(() =>
    device.createRenderPipeline({
      ...base,
      depthStencil: depthStencil(),
      fragment: {
        module,
        entryPoint: "render",
        constants,
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
          { format: "rgba8unorm" },
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

  const execute =
    (pipeline: Signal<GPURenderPipeline>) => (pass: GPURenderPassEncoder) => {
      pass.setPipeline(pipeline());
      pass.setBindGroup(1, bindGroup());
      draw(pass);
    };

  const render = execute(pipeline);
  const pick = execute(pickPipeline);

  return { render, pick };
};
