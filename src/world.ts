import { effect, onCleanup, type Properties, resolve } from "signals.ts";
import { mat4 } from "wgpu-matrix";

import { createLayer, type LayerDescriptor, viewLayout } from "./common";
import { container } from "./container";
import type { Context } from "./context";
import type { Vec2, View } from "./model";
import { createMouse } from "./mouse";
import { createPicker } from "./picker";
import { createRenderer } from "./renderer";
import { buffer, f32, mat4f, position, struct, vec2f } from "./storage";

export type World = Awaited<ReturnType<typeof createWorld>>;

export type WorldProperties = {
  view: View;
  layers: LayerDescriptor[];
};

export const createWorld = async (
  context: Context,
  { view, layers }: Properties<WorldProperties>,
) => {
  const { device, size, textureLoader, element, pickRegistry } = context;

  const renderer = await createRenderer(context);
  const picker = createPicker(context);

  const viewUniform = buffer(
    struct({
      center: position(),
      projection: mat4f(),
      screenSize: vec2f(),
      distance: f32(),
    }),
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
    const { center, distance, orientation, fieldOfView } = resolve(view);
    const [yaw, pitch, roll] = orientation;

    const aspect = width / height;
    const fov = (fieldOfView / 180) * Math.PI;
    const fieldScale = Math.tan(Math.PI / 8) / Math.tan(fov / 2);
    const translateDist = distance * fieldScale;
    const near = Math.max(translateDist - distance, distance * 0.001);
    const far = Math.hypot(translateDist, distance * 100);

    mat4.perspective(fov, aspect, near, far, projection);

    mat4.translate(projection, [0, 0, -translateDist], projection);
    mat4.rotateY(projection, roll, projection);
    mat4.rotateX(projection, pitch, projection);
    mat4.rotateZ(projection, -yaw, projection);

    viewUniform.value.center = center;
    viewUniform.value.projection = projection;
    viewUniform.value.screenSize = [width, height];
    viewUniform.value.distance = distance;
  });

  const root = await createLayer(context, container({ layers }));

  const pick = (xy: Vec2) =>
    picker.read(xy, pass => {
      pass.setBindGroup(0, bindGroup);
      root.pick?.(pass);
    });

  createMouse({ element, pick, pickRegistry, view });

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

    renderer.render(encoder, pass => {
      pass.setBindGroup(0, bindGroup);
      root.render(pass);
    });

    device.queue.submit([encoder.finish()]);

    root.postFrame?.();

    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);

  onCleanup(() => {
    running = false;
  });

  return {
    pick,
    isDragging: pickRegistry.isDragging,
  };
};
