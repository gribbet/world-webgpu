import { createSignal } from "./signal";

export const createCanvas = async () => {
  const { gpu } = navigator;
  const adapter = await gpu.requestAdapter();
  if (!adapter) throw new Error();

  const device = await adapter.requestDevice();

  const canvas = document.createElement("canvas");
  document.body.appendChild(canvas);

  const aspect = createSignal<number>(1);
  new ResizeObserver(([{ contentRect: { width, height } = {} } = {}]) => {
    if (width === undefined || height === undefined) return;
    canvas.width = width;
    canvas.height = height;
    aspect.set(width / height);
  }).observe(canvas);

  const context = canvas.getContext("webgpu");
  if (!context) throw new Error();

  const format = gpu.getPreferredCanvasFormat();
  context.configure({ device, format });

  return { device, context, format, aspect };
};
