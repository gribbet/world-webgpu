import type { Position } from "./model";
import { createRenderPipeline } from "./render";
import type { Signal } from "./signal";

export const createRenderer = async ({
  device,
  context,
  format,
  aspect,
  center,
}: {
  device: GPUDevice;
  format: GPUTextureFormat;
  context: GPUCanvasContext;
  aspect: Signal<number>;
  center: Signal<Position>;
}) => {
  const pipeline = await createRenderPipeline({
    device,
    format,
    aspect,
    center,
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
    });
    pipeline.encode(pass);
    pass.end();

    device.queue.submit([encoder.finish()]);
  };

  return { render };
};
