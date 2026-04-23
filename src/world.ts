import { mat4 } from "wgpu-matrix";

import type { LayerDefinition } from "./common";
import { positionData, viewLayout } from "./common";
import { createContainerLayer } from "./container";
import type { Context } from "./context";
import { createBuffer } from "./device";
import type { View } from "./model";
import { createOutline } from "./outline";
import { createPicker } from "./picker";
import { effect, onCleanup, type Properties, resolve } from "./reactive";
import { createRenderer } from "./renderer";

export type World = Awaited<ReturnType<typeof createWorld>>;

export type WorldProperties = {
  view: View;
  layers: LayerDefinition[];
};

export const createWorld = async (
  context: Context,
  { view, layers }: Properties<WorldProperties>,
) => {
  const { device, size, textureLoader } = context;

  const renderer = createRenderer(context);
  const { renderView, depthView } = renderer;
  const picker = createPicker(context);
  const { pick, positionView, pickView, depthView: pickDepthView } = picker;

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
  effect(() => {
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
  });

  const root = createContainerLayer(context, { layers });

  const outline = await createOutline(context);

  let running = true;
  const frame = () => {
    if (!running) return;

    const encoder = device.createCommandEncoder();

    const compute = encoder.beginComputePass();
    compute.setBindGroup(0, bindGroup);
    root.compute?.(compute);
    compute.end();

    root.update?.(encoder);

    textureLoader.update();

    const pass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: renderView(),
          resolveTarget: context.context.getCurrentTexture().createView(),
          loadOp: "clear",
          storeOp: "discard",
          clearValue: { r: 0, g: 0, b: 0, a: 1 },
        },
      ],
      depthStencilAttachment: {
        view: depthView(),
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
          view: positionView(),
          loadOp: "clear",
          storeOp: "store",
          clearValue: { r: 0, g: 0, b: 0, a: 0 },
        },
        {
          view: pickView(),
          loadOp: "clear",
          storeOp: "store",
          clearValue: { r: 0, g: 0, b: 0, a: 0 },
        },
      ],
      depthStencilAttachment: {
        view: pickDepthView(),
        depthLoadOp: "clear",
        depthStoreOp: "discard",
        depthClearValue: 1.0,
      },
    });

    pickPass.setBindGroup(0, bindGroup);
    root.render(pickPass, { pick: true });
    pickPass.end();

    const outlinePass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: context.context.getCurrentTexture().createView(),
          loadOp: "load",
          storeOp: "store",
        },
      ],
    });
    outline.render(outlinePass, pickView());
    outlinePass.end();

    device.queue.submit([encoder.finish()]);

    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);

  onCleanup(() => {
    running = false;
  });

  return {
    pick,
  };
};
