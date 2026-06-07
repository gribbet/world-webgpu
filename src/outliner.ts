import { derived } from "signals.ts";

import type { Context } from "./context";
import { createTexture } from "./texture";

const outlineTextureFormat: GPUTextureFormat = "rgba8unorm";

type TextureSize = () => readonly [number, number];

export const createOutliner = async ({
  context,
  textureSize,
  sceneTexture,
}: {
  context: Context;
  textureSize: TextureSize;
  sceneTexture: () => GPUTexture;
}) => {
  const { device, format, sampleCount } = context;
  const code = await (
    await fetch(new URL("./outliner.wgsl", import.meta.url))
  ).text();

  const outlineTexture = derived(() =>
    createTexture(device, {
      size: [...textureSize()],
      sampleCount,
      format: outlineTextureFormat,
      usage: GPUTextureUsage.RENDER_ATTACHMENT,
    }),
  );

  const resolvedOutlineTexture = derived(() =>
    createTexture(device, {
      size: [...textureSize()],
      format: outlineTextureFormat,
      usage:
        GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    }),
  );

  const module = device.createShaderModule({ code });
  const bindGroupLayout = device.createBindGroupLayout({
    entries: [
      {
        binding: 0,
        visibility: GPUShaderStage.FRAGMENT,
        texture: {},
      },
      {
        binding: 1,
        visibility: GPUShaderStage.FRAGMENT,
        texture: {},
      },
    ],
  });

  const pipeline = device.createRenderPipeline({
    layout: device.createPipelineLayout({
      bindGroupLayouts: [bindGroupLayout],
    }),
    vertex: { module, entryPoint: "vertex" },
    fragment: {
      module,
      entryPoint: "fragment",
      targets: [{ format }],
    },
  });

  const bindGroup = derived(() =>
    device.createBindGroup({
      layout: bindGroupLayout,
      entries: [
        { binding: 0, resource: sceneTexture().createView() },
        { binding: 1, resource: resolvedOutlineTexture().createView() },
      ],
    }),
  );

  const attachment = (): GPURenderPassColorAttachment => ({
    view: outlineTexture().createView(),
    resolveTarget: resolvedOutlineTexture().createView(),
    clearValue: [0, 0, 0, 0],
    loadOp: "clear",
    storeOp: "discard",
  });

  const render = (encoder: GPUCommandEncoder) => {
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: context.context.getCurrentTexture().createView(),
          loadOp: "clear",
          storeOp: "store",
        },
      ],
    });
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup());
    pass.draw(3);
    pass.end();
  };

  return {
    attachment,
    render,
  };
};
