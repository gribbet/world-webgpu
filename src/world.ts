import { mat4 } from "wgpu-matrix";

import { type LayerDefinition, positionData, viewLayout } from "./common";
import { createContainerLayer } from "./container";
import type { Context } from "./context";
import { createBuffer } from "./device";
import type { View } from "./model";
import { createEffect, onCleanup, type Properties, resolve } from "./reactive";

export type World = ReturnType<typeof createWorld>;

export type WorldProperties = {
  view: View;
  layers: LayerDefinition[];
};

export const createWorld = (
  context: Context,
  { view, layers }: Properties<WorldProperties>,
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

  const centerBuffer = createBuffer(
    device,
    GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    new Uint8Array(16),
  );

  const projectionBuffer = createBuffer(
    device,
    GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    new Float32Array(16),
  );

  const sizeBuffer = createBuffer(
    device,
    GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    new Float32Array(2),
  );

  const layout = viewLayout(device);

  const bindGroup = device.createBindGroup({
    layout,
    entries: [centerBuffer, projectionBuffer, sizeBuffer].map(
      (buffer, binding) => ({ binding, resource: { buffer } }),
    ),
  });

  const projection = mat4.identity();
  const centerData = new Uint8Array(16);
  createEffect(() => {
    const [width, height] = size();
    const {
      center,
      distance,
      orientation: [pitch, yaw, roll],
    } = resolve(view);

    const aspect = width / height;
    const fov = (45 / 180) * Math.PI;
    const near = distance / 100;
    const far = distance * 100;

    mat4.perspective(fov, aspect, near, far, projection);
    mat4.translate(projection, [0, 0, -distance], projection);
    mat4.rotateX(projection, pitch, projection);
    mat4.rotateY(projection, roll, projection);
    mat4.rotateZ(projection, -yaw, projection);

    device.queue.writeBuffer(centerBuffer, 0, positionData(center, centerData));
    device.queue.writeBuffer(projectionBuffer, 0, projection);
    device.queue.writeBuffer(sizeBuffer, 0, new Float32Array([width, height]));
  });

  onCleanup(() => {
    centerBuffer.destroy();
    projectionBuffer.destroy();
    sizeBuffer.destroy();
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

    const compute = encoder.beginComputePass();
    compute.setBindGroup(0, bindGroup);
    root.compute?.(compute);
    compute.end();

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

    pass.setBindGroup(0, bindGroup);
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

    pickPass.setBindGroup(0, bindGroup);
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
