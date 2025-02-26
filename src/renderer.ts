import { createRenderPipeline } from "./render";

export const createRenderer = async ({
  device,
  context,
  format,
  tilesBuffer,
  countBuffer,
  centerBuffer,
  projectionBuffer,
}: {
  device: GPUDevice;
  format: GPUTextureFormat;
  context: GPUCanvasContext;
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
