import { derived } from "signals.ts";

import type { Context } from "./context";
import { createTexture } from "./texture";

type Renderer = (pass: GPURenderPassEncoder) => void;

export const createRenderer = (context: Context) => {
  const { device, size, devicePixelRatio, format, sampleCount } = context;

  const textureSize = derived(() => {
    const [width, height] = size();
    return [width * devicePixelRatio, height * devicePixelRatio] as const;
  });

  const renderTexture = derived(() =>
    createTexture(device, {
      size: [...textureSize()],
      sampleCount,
      format,
      usage: GPUTextureUsage.RENDER_ATTACHMENT,
    }),
  );

  const depthTexture = derived(() =>
    createTexture(device, {
      size: [...textureSize()],
      sampleCount,
      format: "depth24plus",
      usage: GPUTextureUsage.RENDER_ATTACHMENT,
    }),
  );

  const renderView = () => renderTexture().createView();
  const depthView = () => depthTexture().createView();

  const render = (encoder: GPUCommandEncoder, draw: Renderer) => {
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: renderView(),
          resolveTarget: context.context.getCurrentTexture().createView(),
          loadOp: "clear",
          storeOp: "discard",
        },
      ],
      depthStencilAttachment: {
        view: depthView(),
        depthLoadOp: "clear",
        depthStoreOp: "discard",
        depthClearValue: 1.0,
      },
    });

    draw(pass);
    pass.end();
  };

  return {
    render,
  };
};
