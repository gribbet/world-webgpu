import { mat4 } from "wgpu-matrix";

import type { Vec3 } from "./model";
import { createRenderPipeline } from "./render";
import { type Signal, useAll } from "./signal";

export const createRenderer = async ({
  device,
  context,
  format,
  size,
  camera,
  tilesBuffer,
  countBuffer,
  cameraBuffer,
  projectionBuffer,
  textureIndicesBuffer,
  texturesTexture,
}: {
  device: GPUDevice;
  format: GPUTextureFormat;
  context: GPUCanvasContext;
  size: Signal<[number, number]>;
  camera: Signal<Vec3>;
  tilesBuffer: GPUBuffer;
  countBuffer: GPUBuffer;
  cameraBuffer: GPUBuffer;
  projectionBuffer: GPUBuffer;
  textureIndicesBuffer: GPUBuffer;
  texturesTexture: GPUTexture;
}) => {
  const sampleCount = 4;

  const pipeline = await createRenderPipeline({
    device,
    format,
    sampleCount,
    tilesBuffer,
    countBuffer,
    cameraBuffer,
    projectionBuffer,
    textureIndicesBuffer,
    texturesTexture,
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

  useAll([size, camera], (size, [, , z]) => {
    const [width, height] = size;
    const aspect = width / height;
    const fov = 60;
    const near = (z - 1) / 10;
    const far = (z - 1) * 10;
    const projection = mat4.multiply(
      mat4.perspective((fov / 180) * Math.PI, aspect, near, far),
      mat4.scaling([1, -1, 1]),
    );
    device.queue.writeBuffer(projectionBuffer, 0, new Float32Array(projection));

    renderTexture = createRenderTexture(size);
    depthTexture = createDepthTexture(size);
  });

  camera.use(camera =>
    device.queue.writeBuffer(cameraBuffer, 0, new Float32Array(camera)),
  );

  const render = async (count: number) => {
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
    pipeline.encode(pass, count);
    pass.end();

    const { queue } = device;
    queue.submit([encoder.finish()]);
    await queue.onSubmittedWorkDone();
  };

  return { render };
};
