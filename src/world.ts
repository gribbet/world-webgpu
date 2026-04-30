import { mat4 } from "wgpu-matrix";

import type { LayerDescriptor } from "./common";
import { viewLayout } from "./common";
import { createContainerLayer } from "./container";
import type { Context } from "./context";
import type { View } from "./model";
import { createOutline } from "./outline";
import { createPicker } from "./picker";
import { effect, onCleanup, type Properties, resolve } from "./reactive";
import { createRenderer } from "./renderer";
import { buffer, mat4f, position, vec2f } from "./storage";

export type World = Awaited<ReturnType<typeof createWorld>>;

export type WorldProperties = {
  view: View;
  layers: LayerDescriptor[];
};

export const createWorld = async (
  context: Context,
  { view, layers }: Properties<WorldProperties>,
) => {
  const { device, size, textureLoader } = context;

  const renderer = createRenderer(context);
  const { renderView, depthView } = renderer;
  const picker = createPicker(context);
  const { pick, xyView, zView, idView, depthView: pickDepthView } = picker;

  const viewUniform = buffer(
    { center: position(), projection: mat4f(), screenSize: vec2f() },
    device,
    { usage: GPUBufferUsage.UNIFORM },
  );

  const layout = viewLayout(device);

  const bindGroup = device.createBindGroup({
    layout,
    entries: [{ binding: 0, resource: { buffer: viewUniform.buffer() } }],
  });

  const projection = mat4.identity();
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

    viewUniform.item.center = center;
    viewUniform.item.projection = projection;
    viewUniform.item.screenSize = [width, height];
  });

  const root = createContainerLayer(context, { layers });

  const outline = await createOutline(context);

  let running = true;
  const frame = () => {
    if (!running) return;
    viewUniform.flush();

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
          view: xyView(),
          loadOp: "clear",
          storeOp: "store",
        },
        {
          view: zView(),
          loadOp: "clear",
          storeOp: "store",
        },
        {
          view: idView(),
          loadOp: "clear",
          storeOp: "store",
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
    outline.render(outlinePass, idView());
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
