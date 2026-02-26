import { tileTextureLayers } from "./configuration";
import { createSignal } from "./signal";

export type Context = Awaited<ReturnType<typeof createContext>>;

export const createContext = async (element: HTMLCanvasElement) => {
  const sampleCount = 4;

  const { gpu } = navigator;
  const adapter = await gpu.requestAdapter();
  if (!adapter) throw new Error("No WebGPU adapter found");

  const device = await adapter.requestDevice({
    requiredLimits: { maxTextureArrayLayers: tileTextureLayers },
  });

  const { width, height } = element;
  const size = createSignal<[number, number]>([width, height]);
  new ResizeObserver(([{ contentRect: { width, height } = {} } = {}]) => {
    if (width === undefined || height === undefined) return;
    element.width = width;
    element.height = height;
    size.set([width, height]);
  }).observe(element);

  const context = element.getContext("webgpu");
  if (!context) throw new Error();

  const format = gpu.getPreferredCanvasFormat();
  context.configure({ device, format, alphaMode: "opaque" });

  const { destroy } = device;

  return { element, device, context, format, size, sampleCount, destroy };
};
