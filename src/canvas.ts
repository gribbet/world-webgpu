import { createSignal } from "./signal";

export const createCanvas = async () => {
  const { gpu } = navigator;
  const adapter = await gpu.requestAdapter();
  if (!adapter) throw new Error();

  const device = await adapter.requestDevice();

  const element = document.createElement("canvas");
  document.body.appendChild(element);

  const size = createSignal<[number, number]>([1, 1]);
  new ResizeObserver(([{ contentRect: { width, height } = {} } = {}]) => {
    if (width === undefined || height === undefined) return;
    element.width = width;
    element.height = height;
    size.set([width, height]);
  }).observe(element);

  const context = element.getContext("webgpu");
  if (!context) throw new Error();

  const format = gpu.getPreferredCanvasFormat();
  context.configure({ device, format });

  const destroy = () => {
    device.destroy();
    element.remove();
  };

  return { element, device, context, format, size, destroy };
};
