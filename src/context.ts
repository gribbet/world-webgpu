import { tileTextureLayers } from "./configuration";
import { createSignal, onCleanup } from "./reactive";
import { createTextureLoader } from "./texture-loader";

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
  const [size, setSize] = createSignal<[number, number]>([width, height]);
  const observer = new ResizeObserver(
    ([{ contentRect: { width, height } = {} } = {}]) => {
      if (width === undefined || height === undefined) return;
      element.width = width;
      element.height = height;
      setSize([width, height]);
    },
  );
  observer.observe(element);

  const context = element.getContext("webgpu");
  if (!context) throw new Error();

  const format = gpu.getPreferredCanvasFormat();
  context.configure({ device, format, alphaMode: "opaque" });

  const textureLoader = createTextureLoader({ device });

  onCleanup(() => {
    observer.disconnect();
    device.destroy();
  });

  return {
    element,
    device,
    context,
    format,
    size,
    sampleCount,
    textureLoader,
  };
};
