import { createRenderer } from "./renderer";

export const createApp = async () => {
  const { gpu } = navigator;
  const adapter = await gpu.requestAdapter();
  if (!adapter) throw new Error();

  const device = await adapter.requestDevice();

  const canvas = document.createElement("canvas");
  document.body.appendChild(canvas);

  new ResizeObserver(([{ contentRect: { width, height } = {} } = {}]) => {
    if (width === undefined || height === undefined) return;
    canvas.width = width;
    canvas.height = height;
  }).observe(canvas);

  const context = canvas.getContext("webgpu");
  if (!context) throw new Error();

  const format = gpu.getPreferredCanvasFormat();
  context.configure({ device, format });

  const renderer = await createRenderer({
    device,
    context,
    format,
  });

  const frame = () => {
    requestAnimationFrame(frame);
    renderer.render();
  };

  requestAnimationFrame(frame);
};
