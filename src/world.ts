import type { LayerDefinition } from "./common";
import { createContainerLayer } from "./container";
import type { Context } from "./context";
import { createEffect, onCleanup, type Properties } from "./reactive";

export type World = ReturnType<typeof createWorld>;

export type WorldProperties = {
  layers: LayerDefinition[];
};

export const createWorld = (
  context: Context,
  { layers }: Properties<WorldProperties>,
) => {
  const { device, format, sampleCount, size } = context;

  const createRenderTexture = (size: [number, number]) =>
    device.createTexture({
      size,
      sampleCount,
      format,
      usage: GPUTextureUsage.RENDER_ATTACHMENT,
    });

  const createDepthTexture = (size: [number, number], samples: number) =>
    device.createTexture({
      size,
      format: "depth24plus",
      usage: GPUTextureUsage.RENDER_ATTACHMENT,
      sampleCount: samples,
    });

  const createPickTexture = (size: [number, number]) =>
    device.createTexture({
      size,
      format: "rgba32float",
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
    });

  let renderTexture = createRenderTexture([1, 1]);
  let depthTexture = createDepthTexture([1, 1], sampleCount);
  let pickTexture = createPickTexture([1, 1]);
  let pickDepthTexture = createDepthTexture([1, 1], 1);

  createEffect(() => {
    const [width, height] = size();
    renderTexture.destroy();
    depthTexture.destroy();
    pickTexture.destroy();
    pickDepthTexture.destroy();
    renderTexture = createRenderTexture([width, height]);
    depthTexture = createDepthTexture([width, height], sampleCount);
    pickTexture = createPickTexture([width, height]);
    pickDepthTexture = createDepthTexture([width, height], 1);
  });

  onCleanup(() => {
    renderTexture.destroy();
    depthTexture.destroy();
    pickTexture.destroy();
    pickDepthTexture.destroy();
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

    const pickPass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: pickTexture.createView(),
          loadOp: "clear",
          storeOp: "store",
          clearValue: { r: 0, g: 0, b: 0, a: 0 },
        },
      ],
      depthStencilAttachment: {
        view: pickDepthTexture.createView(),
        depthLoadOp: "clear",
        depthStoreOp: "discard",
        depthClearValue: 1.0,
      },
    });
    root.render(pickPass, { pick: true });
    pickPass.end();

    device.queue.submit([encoder.finish()]);

    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);

  onCleanup(() => {
    running = false;
  });

  const pick = async (px: number, py: number) => {
    const readBuffer = device.createBuffer({
      size: 16,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    });

    const encoder = device.createCommandEncoder();
    encoder.copyTextureToBuffer(
      {
        texture: pickTexture,
        origin: [Math.floor(px), Math.floor(py), 0],
      },
      { buffer: readBuffer, bytesPerRow: 256 },
      [1, 1, 1],
    );
    device.queue.submit([encoder.finish()]);

    await readBuffer.mapAsync(GPUMapMode.READ);
    const [x = 0, y = 0, z = 0] = new Float32Array(
      readBuffer.getMappedRange().slice(0, 12),
    );

    readBuffer.unmap();
    readBuffer.destroy();

    return [x, y, z] as const;
  };

  return {
    pick,
  };
};
