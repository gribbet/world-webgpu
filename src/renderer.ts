import { derived } from "@gribbet/signal.ts";

import type { Context } from "./context";
import { createOutliner } from "./outliner";
import { createTexture } from "./texture";

type Renderer = (pass: GPURenderPassEncoder) => void;

export const createRenderer = async (context: Context) => {
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

  const sceneTexture = derived(() =>
    createTexture(device, {
      size: [...textureSize()],
      format,
      usage:
        GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
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
  const sceneView = () => sceneTexture().createView();
  const depthView = () => depthTexture().createView();

  const outliner = await createOutliner({ context, textureSize, sceneTexture });

  const render = (encoder: GPUCommandEncoder, draw: Renderer) => {
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: renderView(),
          resolveTarget: sceneView(),
          loadOp: "clear",
          storeOp: "discard",
        },
        outliner.attachment(),
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

    outliner.render(encoder);
  };

  return {
    render,
  };
};
