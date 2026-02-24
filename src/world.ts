import type { Context } from "./context";
import type { Value } from "./value";
import { resolve } from "./value";

export type Layer = {
  prepare: (encode: GPUCommandEncoder) => void;
  render: (pass: GPURenderPassEncoder) => void;
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
    renderTexture.destroy();
    depthTexture.destroy();
    renderTexture = createRenderTexture(size);
    depthTexture = createDepthTexture(size);
  });

  const unsubscribeLayers = resolve(layers).use(layers => {
    _layers = layers;
  });

  const render = () => {
    const encoder = device.createCommandEncoder();

    _layers.forEach(_ => _.prepare(encoder));

    const pass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: renderTexture.createView(),
          resolveTarget: context.getCurrentTexture().createView(),
          loadOp: "clear",
          storeOp: "discard",
          clearValue: { r: 0, g: 0, b: 0, a: 1 },
        },
      ],
      depthStencilAttachment: {
        view: depthTexture.createView(),
        depthLoadOp: "clear",
        depthStoreOp: "discard",
        depthClearValue: 1.0,
      },
    });
    _layers.forEach(_ => _.render(pass));
    pass.end();

    device.queue.submit([encoder.finish()]);
  };

  let running = true;
  const frame = () => {
    if (!running) return;

    render();

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
