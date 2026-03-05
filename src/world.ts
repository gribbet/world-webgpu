import { createContainerLayer } from "./container";
import type { Context } from "./context";
import { createEffect, onCleanup, type Properties } from "./reactive";

export type Layer = {
  update?: (encode: GPUCommandEncoder) => void;
  render: (pass: GPURenderPassEncoder) => void;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type LayerFactory<P extends Record<string, unknown> = any> = (
  context: Context,
  props: Properties<P>,
) => Layer | Promise<Layer>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type LayerDefinition<P extends Record<string, unknown> = any> =
  readonly [LayerFactory<P>, P];

export const createWorld = (
  context: Context,
  { layers }: Properties<{ layers: LayerDefinition[] }>,
) => {
  const { device, format, sampleCount, size } = context;

  const createRenderTexture = (size: [number, number]) =>
    device.createTexture({
      size,
      sampleCount,
      format,
      usage: GPUTextureUsage.RENDER_ATTACHMENT,
    });

  const createDepthTexture = (size: [number, number]) =>
    device.createTexture({
      size,
      format: "depth24plus",
      usage: GPUTextureUsage.RENDER_ATTACHMENT,
      sampleCount,
    });

  let renderTexture = createRenderTexture([1, 1]);
  let depthTexture = createDepthTexture([1, 1]);

  createEffect(() => {
    const [width, height] = size();
    renderTexture.destroy();
    depthTexture.destroy();
    renderTexture = createRenderTexture([width, height]);
    depthTexture = createDepthTexture([width, height]);
  });

  onCleanup(() => {
    renderTexture.destroy();
    depthTexture.destroy();
  });

  const root = createContainerLayer(context, { layers });

  let running = true;
  const frame = () => {
    if (!running) return;

    const encoder = device.createCommandEncoder();
    root.update?.(encoder);

    const pass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: renderTexture.createView(),
          resolveTarget: context.context.getCurrentTexture().createView(),
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

    root.render(pass);
    pass.end();

    device.queue.submit([encoder.finish()]);

    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);

  onCleanup(() => {
    running = false;
  });
};
