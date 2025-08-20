import type { Context } from "./context";
import type { Value } from "./value";
import { resolve } from "./value";

export type Layer = {
  prepare: () => Promise<void>;
  encode: (pass: GPURenderPassEncoder) => void;
};

export const createWorld = (
  { device, context, format, size, sampleCount }: Context,
  { layers }: { layers: Value<Layer[]> },
) => {
  let _layers: Layer[] = [];

  const createRenderTexture = (size: [number, number]) =>
    device.createTexture({
      size,
      sampleCount,
      format,
      usage: GPUTextureUsage.RENDER_ATTACHMENT,
    });

  let renderTexture = createRenderTexture([1, 1]);

  const createDepthTexture = (size: [number, number]) =>
    device.createTexture({
      size,
      format: "depth24plus",
      usage: GPUTextureUsage.RENDER_ATTACHMENT,
      sampleCount,
    });

  let depthTexture = createDepthTexture([1, 1]);

  const unsubscribeSize = size.use(size => {
    renderTexture = createRenderTexture(size);
    depthTexture = createDepthTexture(size);
  });

  const unsubscribeLayers = resolve(layers).use(layers => {
    _layers = layers;
  });

  const render = async () => {
    const encoder = device.createCommandEncoder();

    const pass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: renderTexture.createView(),
          resolveTarget: context.getCurrentTexture().createView(),
          loadOp: "clear",
          storeOp: "store",
          clearValue: { r: 0, g: 0, b: 0, a: 1 },
        },
      ],
      depthStencilAttachment: {
        view: depthTexture.createView(),
        depthLoadOp: "clear",
        depthStoreOp: "store",
        depthClearValue: 1.0,
      },
    });
    _layers.forEach(_ => _.encode(pass));
    pass.end();

    const { queue } = device;
    queue.submit([encoder.finish()]);
    await queue.onSubmittedWorkDone();
  };

  let running = true;
  const frame = async () => {
    if (!running) return;

    await Promise.all(_layers.map(_ => _.prepare()));
    await render();

    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);

  const destroy = () => {
    running = false;
    unsubscribeSize();
    unsubscribeLayers();
    renderTexture.destroy();
    depthTexture.destroy();
  };

  return { render, destroy };
};
