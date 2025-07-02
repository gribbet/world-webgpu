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
  const pipeline = await createRenderPipeline({
    device,
    format,
    tilesBuffer,
    countBuffer,
    centerBuffer,
    projectionBuffer,
  });

  const createDepth = (size: [number, number]) =>
    device.createTexture({
      size,
      format: "depth24plus",
      usage: GPUTextureUsage.RENDER_ATTACHMENT,
    });

  let depth = createDepth([1, 1]);

  size.use(([width, height]) => {
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
    depth = createDepth([width, height]);
  });

  const render = () => {
    const encoder = device.createCommandEncoder();

    const view = context.getCurrentTexture().createView();
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view,
          loadOp: "clear",
          storeOp: "store",
        },
      ],
      depthStencilAttachment: {
        view: depth.createView(),
        depthLoadOp: "clear",
        depthClearValue: 1.0,
        depthStoreOp: "store",
      },
    });
    pipeline.encode(pass);
    pass.end();

    device.queue.submit([encoder.finish()]);
  };

  return { render };
};
