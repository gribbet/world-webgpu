import { mat4 } from "wgpu-matrix";

import { createRenderPipeline } from "./render";
import type { Signal } from "./signal";

export const createRenderer = async ({
  device,
  context,
  format,
  size,
  tilesBuffer,
  countBuffer,
  centerBuffer,
  projectionBuffer,
}: {
  device: GPUDevice;
  format: GPUTextureFormat;
  context: GPUCanvasContext;
  size: Signal<[number, number]>;
  tilesBuffer: GPUBuffer;
  countBuffer: GPUBuffer;
  centerBuffer: GPUBuffer;
  projectionBuffer: GPUBuffer;
}) => {
  const sampleCount = 4;

  const pipeline = await createRenderPipeline({
    device,
    format,
    sampleCount,
    tilesBuffer,
    countBuffer,
    centerBuffer,
    projectionBuffer,
  });

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

  size.use(size => {
    const [width, height] = size;
    const aspect = width / height;
    const fov = 60;
    const near = 1e-4;
    const far = 10;
    const projection = mat4.perspective(
      (fov / 180) * Math.PI,
      aspect,
      near,
      far,
    );
    device.queue.writeBuffer(projectionBuffer, 0, new Float32Array(projection));

    renderTexture = createRenderTexture(size);
    depthTexture = createDepthTexture(size);
  });

  const render = () => {
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
    pipeline.encode(pass);
    pass.end();

    device.queue.submit([encoder.finish()]);
  };

  return { render };
};
